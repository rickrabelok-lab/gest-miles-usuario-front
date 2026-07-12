# Design: Promoção personalizada proativa (WhatsApp) — Fase 3-B

**Data:** 2026-07-12
**Status:** Aprovado em conceito pelo owner (5 decisões fechadas); aguardando revisão final do spec
**Autor:** Rick Rabelok + Claude
**Spec-mãe:** `docs/superpowers/specs/2026-07-11-promocoes-automaticas-design.md` (Fase 3) · **Irmã:** `2026-07-12-pra-voce-personalizacao-design.md` (Fase 3-A, in-app)

---

## Visão Geral

Fechar o loop da personalização: quando o owner aprova uma **transferência bonificada**, o sistema cruza a promo com a **carteira real dos clientes** (`programas_cliente`) e avisa **proativamente** quem tem o programa de origem com saldo — via WhatsApp. É o disparo que a 3-A (in-app, pull) preparou: a mesma lógica de match, agora empurrada pro cliente.

**Realidade que molda o escopo (verificado 2026-07-12):**
- **145 clientes têm saldo > 0** na carteira (342 linhas) → matéria-prima rica pra personalizar.
- **Só 1 cliente tem grupo WhatsApp** (`agent_grupos`/`agent_vinculos`) — onboarding dos ~400 incompleto (follow-up da Fase C). O canal **direto** ao cliente alcança ~1 pessoa hoje.
- Logo: o **digest interno** (pra equipe acionar via relacionamento existente) é o cavalo de tração hoje; o **direto** cresce sozinho conforme o onboarding avança.

---

## Decisões registradas (owner, 2026-07-12)

1. **Entrega híbrida:** match COM grupo → mensagem direta no grupo do cliente; match SEM grupo → entra no digest do grupo INTERNO (padrão exato da Fase C, "cliente sem grupo → grupo interno").
2. **Cadência:** direto em **tempo real** (no approve) + digest interno **diário** (batch). O direto é baixo volume (sem risco de spam); o digest evita pingar a equipe a cada aprovação.
3. **Gatilho:** **todas** as transfers aprovadas disparam (a aprovação manual do owner É o filtro — não aprova lixo).
4. **Opt-out:** linha em `agent_preferencias` (key-value: `chave='promo_optout'`, `valor='true'`) — honrado desde o dia 1, **default recebe** (ausência de linha = recebe); UI no app é follow-up. **Suprime dos DOIS canais** (direto E digest) — postura LGPD limpa. Sem mudança de schema (a tabela já existe).
5. **Fase 3-A primeiro (in-app):** já entregue (PR #83), valida o matching que a 3-B reusa.

---

## Arquitetura

```
APROVAÇÃO  (backend POST /api/promo-alerts/moderate/:id, após setar approved, se category='transfer')
   └─→ POST webhook n8n  gm-promo-personalizado (promo_id)                    [TEMPO REAL]
          └─ SQL cross: promo × programas_cliente (saldo>0, origem casada) × sem opt-out
                 ├─ cliente COM grupo (agent_vinculos) → msg direta (Evolution) + INSERT no ledger
                 └─ cliente SEM grupo → nada agora (o digest diário cobre)

CRON diário  (n8n gm-promo-digest-interno, ~09:00 SP)                          [BATCH]
   └─ SQL cross das transfers aprovadas nas ÚLTIMAS 24h × programas_cliente (sem grupo, sem opt-out)
          └─ 1 msg no grupo INTERNO do tenant: lista "Cliente — 82k Livelo → 164k Smiles (100%)"
```

Quase tudo vive no n8n (SQL + Evolution, reusando a infra da Fase C). O backend muda **um ponto**. Uma migration nova cria as estruturas de apoio.

### Banco (migration nova — SQL apresentado ao owner antes de aplicar; banco COMPARTILHADO)

**`program_aliases`** — resolve o `source_program` (texto livre do LLM, ex.: "Livelo", "Inter") pro `program_id` canônico da carteira (ex.: `livelo`, `inter-loop`):

| Coluna | Tipo | Nota |
|---|---|---|
| `alias_norm` | text primary key | nome normalizado (sem acento, minúsculo, alnum) |
| `program_id` | text not null | slug do catálogo (`programas_cliente.program_id`) |

- Função `public.promo_norm(text) returns text` — `lower(unaccent(...))` sem `[^a-z0-9]` (mesma normalização do `normalizeProgramToId` do front). Se `unaccent` não estiver disponível, usa `translate` explícito.
- **Seed espelhando a tabela `ALIASES` de `src/lib/promo-alerts/matching.ts`** (livelo, esfera, itau, inter-loop, atomos-c6, amex, smiles, latam-pass, tudo-azul, iberia, tap, all-accor, american-airlines, copa-airlines, qatar-airways, british-airways, finnair + variações). Evita tokens genéricos ("all", "aa", "avios").
- ⚠️ **Alias em 2 lugares** (front TS + esta tabela) — tradeoff aceito. Fix futuro (fora de escopo): gravar `source_program_id` no ingest e cruzar por join direto, aposentando a duplicação.
- RLS on, sem policies + `revoke all` de `anon, authenticated` — só o pipeline (`postgres`, bypassa RLS) lê. O front NÃO usa esta tabela (usa o alias TS próprio da 3-A). Mesmo padrão de `promo_ingest_seen`.

**`promo_alert_envios`** — idempotência do path direto (o link de moderação é idempotente e pode re-disparar o webhook):

| Coluna | Tipo | Nota |
|---|---|---|
| `promo_id` | uuid | fk lógica p/ promo_alerts |
| `cliente_id` | uuid | |
| `canal` | text | `'whatsapp_direto'` (extensível) |
| `enviado_em` | timestamptz default now() | |
| pk | `(promo_id, cliente_id, canal)` | não reenvia a mesma promo pro mesmo cliente |

RLS on, sem policies (só pipeline).

**Opt-out** — **sem mudança de schema.** `agent_preferencias` já é key-value (`cliente_id, chave, valor, confirmada, ...`). Opt-out = existência de linha `(cliente_id, chave='promo_optout', valor='true')`. Cross exclui: `where not exists (select 1 from agent_preferencias p where p.cliente_id = pc.cliente_id and p.chave='promo_optout' and p.valor='true')`, nos DOIS canais. A equipe cria/remove a linha a pedido do cliente (UI no app é follow-up).

### Backend (uma mudança)

`backend/src/routes/promoAlerts.js`, no `POST /moderate/:id`: após o `update` que seta `status='approved'` com sucesso, **se a promo for `category='transfer'`**, dispara `POST` pro webhook n8n `gm-promo-personalizado` com `{ promo_id }`. Autenticação: header `x-api-key` = `AGENT_API_KEY` (mesmo padrão do resumo de demandas da Fase C). Reject e categorias não-transfer **não** disparam. Falha do webhook **não** quebra a moderação (best-effort, logado) — a aprovação já foi persistida e o digest diário é a rede.

- Estender o `.select(...)` do update pra incluir `category` (hoje traz só `id, title`).
- URL/secret do webhook em env do backend (`PROMO_PERSONALIZADO_WEBHOOK_URL` + reuso de `AGENT_API_KEY`).

### n8n (2 workflows novos)

**`gm-promo-personalizado`** (trigger Webhook, tempo real):
1. Recebe `promo_id` (x-api-key conferido).
2. **Postgres — cross direto:** junta `promo_alerts` (a promo, `category='transfer'`, ainda vigente) × `program_aliases` (via `promo_norm(source_program)`) × `programas_cliente pc` (`program_id` casado, `saldo>0`) × `agent_vinculos v` (`v.cliente_id=pc.cliente_id, v.ativo`) → `agent_grupos g` (`g.id=v.grupo_id, g.ativo, g.tenant_id=<tenant piloto>`) pro `grupo_jid`; exclui opt-out (`not exists` linha `promo_optout='true'`); **anti-join** com `promo_alert_envios` (ainda não enviado). Retorna por cliente: `cliente_id, grupo_jid, nome_exibicao, saldo, origem, destino, bonus_numeric, resultado = round(saldo*(1+bonus/100))`.
3. Por item: monta a mensagem ("🎯 Você tem {saldo} {origem} e saiu {bonus}% pra {destino} = {resultado}. Confira as regras.") → **Evolution** envia ao `grupo_jid` → **INSERT** em `promo_alert_envios`. (Texto rico viaja por referência entre nodes HTTP 1:1, `uuid` como param — lições da Fase 1.)

**`gm-promo-digest-interno`** (cron diário ~09:00 SP, batch):
1. **Postgres — cross do dia:** transfers `approved` com `moderated_at >= now()-24h` × aliases × `programas_cliente pc` (`saldo>0`), excluindo opt-out (`not exists promo_optout='true'`), **sem** exigir grupo (o digest é a rede pros sem-grupo; opcionalmente todos os matches). Nome do cliente via `perfis` (join por `cliente_id`) — clientes sem grupo não estão em `agent_vinculos.nome_exibicao`. Agrupa por tenant/equipe.
2. Monta 1 mensagem por grupo interno: cabeçalho + linhas "Nome do cliente — {saldo} {origem} → {resultado} {destino} ({bonus}%)". Sem match no dia → noop (não manda msg vazia).
3. Envia ao `grupo_interno_jid` do tenant (Evolution). Formato de texto no padrão aprovado da Fase C (negrito no cabeçalho, uma linha por cliente).

**Reuso Fase C:** credenciais Evolution/Postgres, tenant piloto id 3 (`gestmiles_qr`), `grupo_interno_jid`. Segue as lições duráveis: UA de browser na API do n8n; `queryReplacement` como array único `={{ [...] }}`; `alwaysOutputData` em nós sem RETURNING; ordem estrita **migration → deploy backend → push do workflow**.

---

## Regras e cálculo

- **Match:** `category='transfer'`, `promo_norm(source_program)` casa um `program_id` na carteira do cliente com `saldo>0`. Mesmo critério da 3-A.
- **Cálculo:** `resultado = round(saldo × (1 + bonus_numeric/100))`. Sem `bonus_numeric` → mensagem sem o número final (raro em transfer).
- **Gatilho:** toda transfer aprovada. Sem piso de bônus.
- **Idempotência:** o direto nunca reenvia a mesma `(promo_id, cliente_id)` (ledger). O digest lista por janela de 24h de `moderated_at`, então não repete promos de dias anteriores.
- **Opt-out:** `promo_optout=true` remove o cliente dos DOIS canais.

## Erros e resiliência

- Webhook fora do ar no approve → moderação segue (best-effort); o digest diário cobre o cliente no dia seguinte.
- Origem não reconhecida pelo alias → cliente não entra (sem match); alias novo é 1 linha na tabela.
- Evolution 400 / sessão caída → alerta interno (receita de diagnóstico da Fase C: `fetchInstances`, QR via `connect`, restart). O ledger só grava após envio OK (senão reenvia no próximo gatilho).
- Sessão WhatsApp é ponto único de falha (herdado da Fase C) — monitorada.

## Testes

- **Vitest (backend):** o gatilho no `POST /moderate/:id` — dispara webhook só em `approve` + `category='transfer'`; não dispara em reject/outras categorias; falha do webhook não quebra a resposta de moderação. Mock do fetch.
- **SQL do cross:** validar em staging-de-mentira (linha sintética) que o cross casa origem×saldo>0, respeita opt-out, e o anti-join do ledger evita reenvio. (Sem ambiente de staging → smoke controlado em prod com linha sintética + cleanup, padrão do smoke da 3-A.)
- **n8n:** E2E via clone temporário (webhook→…→respond) provando o caminho com/sem grupo e o digest; e execução real controlada (aprovar 1 transfer sintética, conferir msg no Grupo Teste, limpar).
- Gates da casa: `npx tsc -b` + `npm test` + `npm run build` (o backend tem sua suíte própria).

## Custos

Marginal ~zero (SQL + Evolution já pagos; sem LLM neste fluxo). Atenção operacional: sessão WhatsApp saudável (herdado da Fase C).

## Fora de escopo (follow-ups)

- **UI de opt-out no app** (toggle no perfil) — a lógica já respeita o flag; falta a tela.
- **Onboarding dos ~400 clientes em grupos** — destrava o alcance do canal direto (hoje ~1). Projeto separado.
- `miles`/`shopping`/`cards` no proativo; push **FCM** (fase de loja).
- **`source_program_id` no ingest** — centraliza a normalização e aposenta a duplicação de alias (front TS × `program_aliases`).
- Trocar o `grupo_interno_jid` provisório (Grupo Teste) pelo grupo interno real (1 UPDATE — follow-up aberto da Fase C).
