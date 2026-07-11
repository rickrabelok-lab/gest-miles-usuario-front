# Design: Promoções Automáticas (ingestão + curadoria + hub real)

**Data:** 2026-07-11
**Status:** Aprovado em conceito pelo owner (4 decisões fechadas); aguardando revisão final do spec
**Autor:** Rick Rabelok + Claude

---

## Visão Geral

Substituir o dado fake do hub de promoções (`/bonus-offers`) por um pipeline **automático** de ingestão de promoções de milhas/pontos/cashback do mercado BR, com curadoria humana de 1 toque no início e personalização por carteira como diferencial final.

**Tese de produto:** feed genérico de promoção é commodity (Oktoplus, blogs, canais Telegram grátis). O diferencial Gest Miles é cruzar a promoção com a **carteira real do cliente** (`programas_cliente`): "você tem 82k Livelo e saiu 100% de bônus pra Smiles". O feed é matéria-prima; o alerta personalizado é o produto.

**Estado atual (verificado 2026-07-11):**
- Hub `/bonus-offers` construído (4 categorias: transfer/shopping/miles/cards), mas transfer/miles/cards rodam em `src/lib/bonusMockData.ts` (mock estático de abril) e shopping lê a tabela `bonus_offers` semeada com dados de exemplo (`example.com`).
- Infra reaproveitável no ar: n8n (`n8n.gestmiles.com.br`) com cron/webhook/Postgres funcionando (Fase C WhatsApp), Evolution API (grupos WhatsApp interno + por cliente), padrão BFF `/api/agent/*` com `x-api-key`, n8n conecta no Postgres do Supabase como `postgres` (bypassa RLS).

---

## Decisões registradas (owner, 2026-07-11)

1. **Passageiro de Primeira fica FORA** — o site bloqueia bots explicitamente (403 Cloudflare + robots anti-IA + `Content-Signal: use=reference, ai-train=no`). Não contornamos; as demais fontes cobrem as mesmas promoções.
2. **Curadoria inicial: tudo passa pelo grupo WhatsApp interno** — aprovação de 1 toque antes de publicar no app. Automação total é conquistada com taxa de acerto comprovada (fase 4).
3. **Migration nova no banco compartilhado: OK em princípio** — SQL final ainda será apresentado ao owner antes de aplicar (regra da casa).
4. **Chip dedicado pro Telegram (Livelo): owner consegue** — habilita a fase 2 completa.

---

## Fontes (verificadas por fetch real em 2026-07-11)

| Fonte | Método | Fase | Observações |
|---|---|---|---|
| Melhores Cartões — `https://www.melhorescartoes.com.br/c/promocoes-milhas/feed/` | RSS (conteúdo COMPLETO no `content:encoded`) | 1 | Melhor fonte; ~10 posts/dia; digest 08:00 |
| Pontos pra Voar — `https://pontospravoar.com/category/promocoes/feed/` | RSS (só resumo) | 1 | Volume altíssimo; "Radar PPV" diário ~23:00 |
| Melhores Destinos — `https://www.melhoresdestinos.com.br/milhas/feed` | RSS (só resumo) | 1 | Foco transferências bonificadas |
| Telegram Esfera — `t.me/s/esferacomvoce` | Scrape do preview web público | 2 | Canal público oficial; HTML parseável, paginação `?before=<id>` |
| Telegram Livelo — canal por convite (sem username público) | **Só MTProto** (conta de usuário que entrou pelo convite) | 2 | Worker dedicado + chip físico BR; sessão persistida; só leitura |
| Newsletters Smiles/Latam Pass/Azul (sem canal Telegram oficial) | Caixa de e-mail dedicada + n8n IMAP trigger | 2 | Fonte estável e 100% legítima |
| Passageiro de Primeira | — | **NUNCA** | Decisão 1 |

**Fato de mercado:** não existe API pública/estruturada de bônus de transferência no BR. A base histórica que este pipeline acumula (canonical_key + datas) vira ativo próprio (fase 4).

**Regra de conteúdo (copyright):** extraímos o **fato** da promoção (programa, %, validade, regras essenciais) e escrevemos copy próprio; sempre com link de crédito "ver na fonte". Nunca republicar texto de artigo.

---

## Arquitetura

```
FONTES                      PIPELINE (n8n, cron 15min)              PRODUTO
─────────                   ──────────────────────────              ─────────
RSS (3 feeds)          ──┐   coleta → dedup (promo_ingest_seen)
t.me/s/esferacomvoce   ──┼─→ → LLM (Haiku) extrai JSON         ──→  promo_alerts (Supabase,
Worker MTProto: Livelo ──┤     estruturado → upsert por              RLS: só approved+vigente)
E-mail mkt (IMAP)      ──┘     canonical_key                              │
                                     │                                    ├─→ hub /bonus-offers (real)
                              status='pending' → card no grupo           ├─→ fase 3: cruzamento c/
                              WhatsApp interno com link de               │   programas_cliente →
                              moderação (página de confirmação)          │   alerta personalizado
                                                                         └─→ push: WhatsApp (existente);
                                                                              FCM na fase de loja
```

### Banco (migration nova — apresentar SQL ao owner antes de aplicar)

**`promo_alerts`** — tabela canônica de promoções:

| Coluna | Tipo | Nota |
|---|---|---|
| `id` | uuid pk default gen_random_uuid() | |
| `category` | text check in ('transfer','shopping','miles','cards') | alinhado ao hub existente |
| `source_program` / `target_program` | text | ex.: Livelo → Smiles (target null p/ shopping/cards) |
| `title` | text not null | copy próprio curto |
| `bonus_value` | text | "100%", "10 pts/R$", "-30%" |
| `bonus_numeric` | numeric | ordenação/comparação |
| `tiers` | jsonb | ex.: clube vs não-clube |
| `valid_from` / `valid_until` | date | validade parseada |
| `details` | text | regras resumidas, copy próprio |
| `cta_url` | text | link da promoção oficial quando conhecido |
| `source_links` | jsonb | array `{name,url}` — crédito das fontes (merge no dedup) |
| `canonical_key` | text unique | ex.: `transfer:livelo>smiles:100:2026-07-31` |
| `confidence` | numeric | do extrator LLM |
| `status` | text check ('pending','approved','rejected','expired') default 'pending' | |
| `raw` | jsonb | payload bruto p/ debug |
| `created_at` / `updated_at` / `moderated_at` | timestamptz | |

- **RLS:** `select` público apenas `status='approved' and (valid_until is null or valid_until >= current_date)`. **Nenhuma policy de escrita** → escreve só service role (BFF) e a conexão `postgres` do n8n. Segue o padrão da casa (leitura estilo `bonus_offers`, escrita estilo `agent_*`).
- **`promo_ingest_seen`** — staging de dedup por item de fonte: `(source text, external_id text, seen_at timestamptz, pk(source, external_id))`. RLS on, sem policies (só pipeline).
- `bonus_offers` (tabela + rota BFF) **fica intacta** nesta fase; as linhas-demo `example.com` serão desativadas (`active=false`) num passo separado com OK do owner (o manager pode renderizar a mesma tabela).

### Pipeline n8n (fase 1)

1. **Workflow `gm-promo-ingest`** (cron 15min): lê os 3 feeds RSS → filtra itens novos contra `promo_ingest_seen` → chama API Anthropic (**claude-haiku-4-5**, credencial n8n; chave jamais no front) com prompt de extração → JSON `{is_promo, category, source_program, target_program, bonus_value, bonus_numeric, tiers, valid_from, valid_until, title, details, cta_url, confidence, canonical_key}` → descarta `is_promo=false` → **upsert** em `promo_alerts` por `canonical_key` (novo → `pending`; existente → merge de `source_links`, sem rebaixar status).
2. **Curadoria:** item novo `pending` → mensagem no grupo interno via Evolution (resumo + fontes + 2 links de moderação). **Links abrem página de confirmação com botão** (POST) — nunca GET que executa direto, porque o preview de link do WhatsApp faz prefetch e auto-aprovaria.
3. **Workflow `gm-promo-housekeeping`** (cron diário): marca `expired` quem venceu (higiene; a RLS já esconde) e **monitor de silêncio** — fonte sem item novo há 48h → alerta no grupo interno (scrapers quebram em silêncio).

### BFF (backend Express)

- `GET /api/promo-alerts` — lista aprovadas/vigentes (espelha o padrão dual de `bonus-offers`: front usa BFF quando `hasApiUrl()`, senão Supabase direto via RLS).
- `GET /api/promo-alerts/moderate/:id?action=&token=` — página HTML mínima de confirmação com botão; `POST` executa. Token HMAC-SHA256 de `(id, action)` com secret em env do backend + n8n (mesmo padrão `AGENT_API_KEY`). Idempotente.

### Front (fase 1)

- Substituir `bonusMockData.ts` nas seções transfer/miles/cards por dados de `promo_alerts` (service + hook novos seguindo o padrão `lib/bonus-offers/service.ts`, com timeout e fallback).
- Card ganha: validade, crédito de fonte ("via Melhores Cartões") e CTA quando houver. Detail screen: `details`, `tiers`, links de fonte.
- Shopping continua em `bonus_offers` até o pipeline capturar shopping bem; swap depois.
- **Sync manager:** regra do owner — tela de cliente replicada no manager (fork do Index). Registrar follow-up ao final da fase 1.

---

## Fases

- **Fase 1 — MVP feed real (RSS → app):** migration + workflow ingest + moderação + swap do mock + housekeeping. *~2–3 sessões.*
- **Fase 2 — Tempo real:** scraper Esfera (`t.me/s/`), worker MTProto Livelo (GramJS/Telethon em Railway/Fly, sessão persistida, POST pra webhook n8n; chip do owner), IMAP newsletters. *~2 sessões.*
- **Fase 3 — Personalização:** `promo_alerts` × `programas_cliente` (saldo>0 no programa de origem) → alerta com valor calculado pro cliente, via grupo WhatsApp do cliente (infra Fase C) + seção "pra você" no app. Limite de frequência + opt-out. Push FCM junto com a fase de loja. *~2–3 sessões.*
- **Fase 4 — Rédea solta + ativo de dados:** auto-publicar acima de threshold de confiança (quando a taxa de acerto da curadoria provar), histórico de bônus por rota (view sobre `promo_alerts`).

## Erros e resiliência

- Fonte fora do ar / feed inválido → item pulado, sem retry agressivo; monitor de silêncio cobre a detecção.
- LLM retorna JSON inválido → 1 retry com erro anexado; falhou de novo → registra em `raw` + alerta interno, não publica.
- Promo duplicada com % divergente entre fontes → mantém a de maior confiança, anota conflito no card de curadoria.
- Conta Telegram (fase 2) é ponto único de falha: sessão monitorada; desconexão → alerta interno.

## Testes

- Vitest: service/hook novos do front (mapeamento de linha, filtro de vigência) — padrão `bonus-offers/service.test.ts`.
- Golden set: ~10 posts reais salvos como fixtures pra validar o prompt de extração (rodar manualmente ao ajustar o prompt).
- E2E manual da fase 1: post real → pipeline → card no grupo interno → aprovar → aparece no app.
- Gates da casa antes de "pronto": `npx tsc -b` + `npm test` + `npm run build`.

## Custos

LLM ~R$5–15/mês (dezenas de itens/dia no Haiku) · worker fase 2 ~US$5/mês · chip pré-pago · n8n/Supabase/Vercel já pagos. Custo real: ~1h/semana de atenção a fonte quebrada no início.

## Fora de escopo

- OpenClaw/ClawHub/skills marketplaces como runtime (descartados: single-user por design, 40k+ instâncias expostas, supply chain do ClawHub comprometida — 341+ skills maliciosas).
- Passageiro de Primeira como fonte (decisão 1).
- Conexão de conta do cliente nos programas (modelo Oktoplus) — outro produto.
- Remover `bonus_offers`/rota legada.
- Push nativo FCM (entra na fase de loja do mobile).
