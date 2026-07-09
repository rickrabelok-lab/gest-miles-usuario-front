# Notificações de demanda via WhatsApp (Fase C do agente) — Design

**Data:** 2026-07-09 · **Status:** aprovado pelo owner · **Escopo:** usuario-front (migration + BFF) + projeto `gestmiles-agente-whatsapp` (workflows n8n + banco do agente)

## Contexto

- A cotação solicitada no app do usuário **já vira demanda** para o gestor responsável: o `SolicitarCotacaoWizard` resolve o gestor e o `Index.tsx` chama a RPC `cliente_criar_demanda` (`supabase/migrations/20260517203529_p1_usuario_demandas_cliente_rpc.sql`) com `targetGestorId` no payload. Nada a construir aí.
- O agente WhatsApp GestMiles (n8n + Evolution API v2, produção em `https://n8n.gestmiles.com.br`) já tem a infra de envio e o mapeamento cliente→grupo: `agent_tenants` (instância Evolution + `equipe_id` + `api_base`), `agent_grupos` (whitelist de grupos), `agent_vinculos` (`participante_jid` → `cliente_id` do GestMiles). Fonte: `C:\Users\rick_\Downloads\gestmiles-agente-whatsapp\` (`sql/agente-schema.sql`, `docs/decisoes.md`).
- Este design é a **Fase C** prevista em `docs/decisoes.md` do agente: "alertas proativos serão um SEGUNDO workflow com gatilho próprio (cron/evento do GestMiles), enviando pela Evolution do tenant".
- Fatos confirmados no projeto Supabase compartilhado (`jntkpcjmmnaghmimdcam`): `pg_net` 0.19.5 instalada, `supabase_vault` instalada, `demandas_cliente(id, cliente_id, tipo, status, payload, created_at, updated_at, target_gestor_id, sub_status)`, status usados: `pendente`, `em_andamento`, `concluida`, `cancelada`.

## Requisitos (decisões do owner)

1. **Gatilho:** só demandas criadas **pelo app do usuário** notificam o grupo do cliente. Demandas do agente WhatsApp (que já confirma em chat) e do manager ficam de fora.
2. **Cliente sem grupo mapeado:** alerta vai pro **grupo interno da equipe** ("registrada pelo app, cliente sem grupo — avisar manualmente").
3. **Resumo diário de demandas** (novas, pendentes, em andamento, paradas) vai pro **mesmo grupo interno da equipe**.
4. **Frequência do resumo:** dias úteis (seg–sex), de manhã (08:30 America/Sao_Paulo).

## Arquitetura

```
App usuário ──rpc──> cliente_criar_demanda (carimba origem_registro='app_cliente')
                        │ INSERT demandas_cliente
                        ▼
              trigger AFTER INSERT (só origem app_cliente)
                        │ net.http_post (URL+secret no Vault)
                        ▼
        n8n gm-notificar-demanda ──lookup banco do agente──> grupo do cliente?
                        ├─ sim → Evolution sendText no grupo do cliente
                        └─ não → Evolution sendText no grupo interno da equipe

        n8n gm-resumo-demandas (cron seg–sex 08:30)
                        │ GET /api/agent/demandas-resumo (x-api-key, BFF Express)
                        ▼
              por equipe → agent_tenants.grupo_interno_jid → Evolution sendText
```

Fronteiras preservadas: o n8n **nunca** toca o banco do GestMiles (lê via BFF); o GestMiles não toca o banco do agente (só chama o webhook); segredo nenhum toca o front.

## Componentes

### C1. Migration no GestMiles (este repo, `supabase/migrations/`)

Aditiva, rollback = `drop trigger` + restaurar RPC.

1. **`cliente_criar_demanda`** (create or replace, corpo idêntico) passa a inserir `p_payload || jsonb_build_object('origem_registro', 'app_cliente')`.
2. **Função de trigger `public.demanda_app_notify_whatsapp()`** — `security definer`, `set search_path = public, extensions, pg_temp`:
   - Sai imediatamente se `coalesce(new.payload->>'origem_registro','') <> 'app_cliente'`.
   - Lê do Vault (`vault.decrypted_secrets`) os secrets `n8n_demanda_webhook_url` e `n8n_demanda_webhook_secret`; se qualquer um faltar → no-op silencioso (infra não configurada ainda).
   - Enriquece: nome do cliente via `perfis` (`coalesce(nullif(trim(nome),''), nome_completo)` por `usuario_id = new.cliente_id`) + `equipe_id`.
   - `net.http_post` com header `x-webhook-secret` e body JSON (ver contrato abaixo).
   - **Corpo inteiro em `begin/exception when others`** com `raise warning` — falha de notificação jamais impede a criação da demanda. `pg_net` é async/best-effort (sem retry; falhas visíveis em `net._http_response`).
3. Trigger `after insert on public.demandas_cliente for each row`.
4. Secrets do Vault são inseridos **à mão no SQL Editor** (nunca commitados). A migration não contém segredo.

**Contrato do webhook (POST):**

```json
{
  "evento": "demanda_registrada",
  "demanda_id": 142,
  "cliente_id": "uuid",
  "cliente_nome": "João Silva",
  "equipe_id": "uuid | null",
  "tipo": "emissao | outros",
  "status": "pendente",
  "created_at": "2026-07-09T12:00:00Z",
  "gestor_id": "uuid | null  (payload.targetGestorId)",
  "resumo": {
    "origem": "GRU", "destino": "LIS", "dataIda": "2026-08-12", "dataVolta": "2026-08-26",
    "passageiros": 2, "classeVoo": "executiva", "escopo": "internacional",
    "categoria": null, "detalhes": null
  }
}
```

Sem PII sensível (sem CPF/telefone/credenciais) — só nome + dados da viagem.

### C2. Banco do agente — coluna nova

```sql
alter table agent_tenants add column grupo_interno_jid text; -- grupo operacional interno da equipe (fallback + resumo diário)
```

Populada manualmente (mesmo onboarding manual do MVP do agente). Atualizar `sql/agente-schema.sql` no projeto do agente.

### C3. Workflow n8n `gm-notificar-demanda` (arquivo novo `workflow-notificar-demanda.json` na pasta do agente)

1. **Webhook** POST `gm-demanda-registrada` → **IF** valida `x-webhook-secret` contra credencial/env do n8n (mismatch → responde 401 e para).
2. **Postgres (banco do agente):** grupo do cliente:
   ```sql
   select g.grupo_jid, t.server_url, t.instance
   from agent_vinculos v
   join agent_grupos g on g.id = v.grupo_id and g.ativo
   join agent_tenants t on t.id = g.tenant_id and t.ativo
   where v.cliente_id = $cliente_id and v.tipo = 'cliente' and v.ativo
     and ($equipe_id is null or t.equipe_id = $equipe_id)
   order by g.id limit 1
   ```
   Cliente com N grupos → usa o primeiro (MVP; anotado como limitação).
3. **Achou:** monta mensagem (Code/Set) → HTTP Request `{{server_url}}/message/sendText/{{instance}}` (credencial Evolution já existente no n8n) → responde 200.
4. **Não achou:** busca `grupo_interno_jid`+`server_url`+`instance` em `agent_tenants` por `equipe_id` (fallback: tenant ativo único) → manda alerta. Sem grupo interno também → só loga (workflow não falha).
5. Erros conectados ao error handler padrão do n8n da casa (se existir; senão, `continueOnFail` + log estruturado).

**Mensagem — grupo do cliente, tipo `emissao`:**

> ✈️ *Demanda registrada!*
>
> *{cliente_nome}*, recebemos sua solicitação de cotação:
> 📍 {origem} → {destino}
> 📅 Ida {dataIda}{· Volta se houver} · 👥 {passageiros} pax · {classeVoo}
>
> Nosso time já está cuidando disso — em breve seu gestor te retorna por aqui. 🙌

**Tipo `outros`:** variante com {categoria} + {detalhes} resumido. Campos ausentes somem da mensagem (sem "null").

**Alerta — grupo interno (cliente sem grupo):**

> ⚠️ *Demanda #{demanda_id} sem grupo de WhatsApp*
> Cliente: {cliente_nome}
> {tipo/resumo curto}
> Registrada pelo app — avisar o cliente manualmente.

### C4. Rota BFF `GET /api/agent/demandas-resumo` (este repo, `backend/src/routes/`)

- **Auth:** header `x-api-key` === `process.env.AGENT_API_KEY` (env nova no `backend/.env` e no projeto Vercel do backend). Sem chave configurada → 503; chave errada → 401. Não usa sessão de usuário (server-to-server).
- **Dados:** via `supabaseService` (service role): demandas com `status in ('pendente','em_andamento')` + criadas nas últimas 24h, join `perfis` (nome, equipe_id) por `cliente_id`.
- **Agregação em função pura** `backend/src/lib/demandasResumo.js` (testável): agrupa por `equipe_id` e calcula `novas_24h`, `pendentes`, `em_andamento`, `paradas_3d` (status ativo e `updated_at < now()-3d`) + lista curta por demanda (`id`, `cliente_nome`, `tipo`, `resumo_curto`, `status`, `dias_parada`).
- **Response:** `{ gerado_em, equipes: [{ equipe_id, contagens: {...}, demandas: [...] }] }`.

### C5. Workflow n8n `gm-resumo-demandas` (arquivo novo `workflow-resumo-demandas.json`)

1. **Schedule:** seg–sex 08:30 `America/Sao_Paulo`.
2. **HTTP GET** no BFF com `x-api-key` (credencial n8n).
3. Por equipe: **Postgres (banco do agente)** resolve `grupo_interno_jid`/`server_url`/`instance` em `agent_tenants` por `equipe_id`; sem grupo interno → pula e loga.
4. Monta e envia:

> 📋 *Resumo de demandas — {dia da semana}, {dd/mm}*
>
> 🆕 Novas (24h): {n} · ⏳ Pendentes: {n} · 🔧 Em andamento: {n} · 🚨 Paradas 3+ dias: {n}
>
> *Pendentes:*
> • #{id} {cliente} — {resumo curto} (há {n}d)
> *Em andamento:* …

Listas limitadas (ex.: 10 itens por seção, "+N outras" no fim) pra mensagem não estourar.

## Segurança

- Evento nasce **no banco** (Zero Trust — front não dispara nem sabe do webhook). Nenhuma env `VITE_` nova.
- Secret do webhook: Vault (Postgres) ↔ credencial do n8n. API key do resumo: `backend/.env`/Vercel ↔ credencial do n8n. Nada em código.
- A migration não abre nenhuma leitura nova pra `anon`/`authenticated`; função de trigger não é exposta como RPC (sem grant além do necessário pro trigger).
- Payloads sem CPF/telefone/segredos de programa.

## Erros e resiliência

- Criação de demanda **nunca** falha por causa de notificação (exception handler no trigger + pg_net async).
- n8n: validação de secret responde 401; falha de envio Evolution não derruba o workflow (log + error handler); resumo pula equipes sem grupo interno com log.
- Auditoria de cobertura: alertas de "cliente sem grupo" no grupo interno funcionam como fila de onboarding.

## Testes e verificação

- Backend: teste unitário Vitest da agregação (`demandasResumo`) + teste do guard `x-api-key` (padrão dos testes existentes do backend). `tsc -b` + `npm test` (raiz) + testes do backend + `npm run build` antes de "pronto".
- n8n: importar workflows **inativos** via `scripts/import-workflow-n8n.mjs`; testar `gm-notificar-demanda` com payload manual (modo teste do webhook) apontando pra um **grupo de teste**; testar resumo com execução manual.
- Smoke E2E: conta `smoke-usuario@gestmiles.com.br` cria cotação no app → mensagem chega no grupo de teste.

## Rollout (ordem segura — banco compartilhado, sem staging)

1. Coluna `grupo_interno_jid` no banco do agente + workflows importados inativos + credenciais n8n.
2. Secrets no Vault do Supabase (SQL Editor, à mão).
3. Migration no GestMiles — **aplicar só com confirmação explícita do owner na hora**.
4. Ativar `gm-notificar-demanda` → smoke E2E.
5. Ativar cron do resumo; conferir primeira execução real.

## Fora de escopo (anotado pra depois)

- Notificar mudança de status (em andamento/concluída) no grupo do cliente.
- Segundo horário do resumo (fim de tarde).
- Onboarding de grupos/vínculos via UI (segue manual).
- Retry/fila para falhas do webhook (pg_net é best-effort).
- Migrar a fonte do resumo do BFF para a `agent-api` real (etapa 8 do agente) — troca de URL no workflow, sem retrabalho.
