# Promoção personalizada proativa (Fase 3-B) — Implementation Plan

> **For agentic workers:** este plano é majoritariamente **infra (migration + n8n + rollout)**, executado pelo CONTROLLER (precisa de acesso vivo ao n8n/Evolution + checkpoints do owner), como as Tasks 7-10 da Fase 1. Só a **Task 1 (migration)** é um artefato de repo isolável (subagente pode transcrever+revisar). Tasks 2-4 são controller-only.

**Goal:** Quando o owner aprova uma transferência bonificada, avisar proativamente por WhatsApp os clientes que têm o programa de origem com saldo — direto no grupo do cliente (quem tem) + digest diário no grupo interno (quem não tem).

**Architecture:** pg trigger na aprovação → webhook n8n (tempo real) que cruza a promo × carteiras (SQL, reusando `program_aliases`+`promo_norm`) e envia via Evolution aos clientes com grupo (idempotente via `promo_alert_envios`) + cron n8n diário que manda o digest interno dos matches sem grupo. Zero mudança de backend.

**Tech Stack:** Postgres (Supabase, migration), pg_net + Vault (webhook), n8n (workflows), Evolution API (WhatsApp). Reusa a infra da Fase C.

## Global Constraints

- **Banco COMPARTILHADO (sem staging).** A migration é **escrita mas NÃO aplicada** aqui — o rollout é controller com **checkpoint do owner** (Task 4).
- **Ordem estrita de rollout:** migration → (Vault secrets) → deploy (n/a aqui) → push+activate workflows. Push de workflow antes da migration quebra.
- **Match = `category='transfer'`**, origem via `promo_norm(source_program)` casando `program_id` na carteira com `saldo>0`. `resultado = round(saldo × (1 + bonus_numeric/100))`.
- **Opt-out** (`agent_preferencias` `chave='promo_optout' valor='true'`) suprime dos DOIS canais.
- **Idempotência do direto:** anti-join com `promo_alert_envios`; INSERT só após envio OK.
- **Números pt-BR** nas mensagens (`toLocaleString('pt-BR')` nos Code nodes).
- **Lições n8n (duráveis):** UA de browser na API do n8n; `queryReplacement` como array único `={{ [...] }}`; `alwaysOutputData` em nós sem RETURNING; texto rico viaja por referência entre nós HTTP 1:1 (param só valor simples: uuid/número); Code node com `$json`/`.item` precisa `"mode":"runOnceForEachItem"`.
- **Tenant piloto:** `agent_tenants` id 3 (`gestmiles_qr`), `grupo_interno_jid` = Grupo Teste (provisório). Credenciais Evolution/Postgres da Fase C.
- **Segredos NUNCA no git:** Vault (`n8n_promo_personalizado_webhook_url`/`_secret`) + credenciais n8n. `N8N_API_KEY` vive em `C:\Users\rick_\Downloads\rickrabelo-viagens-ig\tools\secrets.local.json` (ler, nunca imprimir).
- **Subagentes NÃO commitam** `CLAUDE.md`/`.claude/settings.local.json`/`backend/.gitignore` — só os arquivos da task.

---

### Task 1: Migration (program_aliases + promo_norm + promo_alert_envios + trigger de aprovação)

**Subagente-able (transcrição de SQL + revisão). NÃO aplicar.**

**Files:**
- Create: `supabase/migrations/20260712150000_promo_personalizada_proativa.sql`

- [ ] **Step 1: Escrever a migration** (conteúdo exato)

```sql
-- Fase 3-B: promoção personalizada proativa (WhatsApp).
-- Cria: promo_norm() + program_aliases (cross nome->program_id), promo_alert_envios
-- (idempotência do direto), e o trigger de aprovação que dispara o webhook n8n
-- (pg_net + Vault, mesmo padrão da notificação de demanda 20260709120000).
-- NÃO aplicar aqui: rollout controlado com OK do owner (banco compartilhado).
-- Rollback: drop trigger trg_promo_aprovada_notify on public.promo_alerts;
--           drop function public.promo_aprovada_notify();
--           drop table public.promo_alert_envios; drop table public.program_aliases;
--           drop function public.promo_norm(text);
begin;

create extension if not exists unaccent with schema extensions;

-- Normaliza nome de programa: sem acento, minúsculo, só [a-z0-9] (espelha o
-- normalizeProgramToId do front, src/lib/promo-alerts/matching.ts).
create or replace function public.promo_norm(p_text text)
returns text
language sql
stable
set search_path = public, extensions, pg_temp
as $$
  select regexp_replace(lower(extensions.unaccent(coalesce(p_text, ''))), '[^a-z0-9]+', '', 'g');
$$;

-- Alias nome-normalizado -> program_id. Seed espelha a tabela ALIASES do front.
-- ⚠️ Sync front<->DB (2 lugares). Evita tokens genéricos ("all","aa","avios").
create table if not exists public.program_aliases (
  alias_norm text primary key,
  program_id text not null
);
alter table public.program_aliases enable row level security;
revoke all on public.program_aliases from anon, authenticated;

insert into public.program_aliases (alias_norm, program_id) values
  ('livelo','livelo'),
  ('esfera','esfera'),
  ('itau','itau'),('itaucard','itau'),('itaucartoes','itau'),
  ('interloop','inter-loop'),('inter','inter-loop'),('interpontos','inter-loop'),('loop','inter-loop'),
  ('atomosc6','atomos-c6'),('atomos','atomos-c6'),('c6','atomos-c6'),('c6atomos','atomos-c6'),('c6bank','atomos-c6'),
  ('amex','amex'),('americanexpress','amex'),('membershiprewards','amex'),('amexrewards','amex'),
  ('smiles','smiles'),
  ('latampass','latam-pass'),('latam','latam-pass'),
  ('tudoazul','tudo-azul'),('azul','tudo-azul'),
  ('iberia','iberia'),('iberiaplus','iberia'),
  ('tap','tap'),('tapmilesego','tap'),('milesego','tap'),
  ('allaccor','all-accor'),('accor','all-accor'),
  ('aadvantage','american-airlines'),('americanairlines','american-airlines'),
  ('copa','copa-airlines'),('copaairlines','copa-airlines'),('connectmiles','copa-airlines'),
  ('qatar','qatar-airways'),('qatarairways','qatar-airways'),
  ('britishairways','british-airways'),
  ('finnair','finnair'),('finnairplus','finnair')
on conflict (alias_norm) do update set program_id = excluded.program_id;

-- Idempotência do envio direto: (promo, cliente, canal) já enviado não reenvia.
create table if not exists public.promo_alert_envios (
  promo_id uuid not null,
  cliente_id uuid not null,
  canal text not null default 'whatsapp_direto',
  enviado_em timestamptz not null default now(),
  primary key (promo_id, cliente_id, canal)
);
alter table public.promo_alert_envios enable row level security;
revoke all on public.promo_alert_envios from anon, authenticated;

-- Trigger de aprovação: dispara webhook n8n via pg_net (best-effort, no-op sem Vault).
create or replace function public.promo_aprovada_notify()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_url text;
  v_secret text;
begin
  begin
    select decrypted_secret into v_url
      from vault.decrypted_secrets where name = 'n8n_promo_personalizado_webhook_url';
    select decrypted_secret into v_secret
      from vault.decrypted_secrets where name = 'n8n_promo_personalizado_webhook_secret';
    if v_url is null or v_secret is null then
      return new; -- infra ainda não configurada: no-op silencioso
    end if;
    perform net.http_post(
      url := v_url,
      body := jsonb_build_object('evento', 'promo_aprovada', 'promo_id', new.id),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret)
    );
  exception when others then
    -- Notificação é best-effort: NUNCA derruba o UPDATE de moderação.
    raise warning 'promo_aprovada_notify falhou (promo %): %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.promo_aprovada_notify() from public, anon, authenticated;

drop trigger if exists trg_promo_aprovada_notify on public.promo_alerts;
create trigger trg_promo_aprovada_notify
  after update of status on public.promo_alerts
  for each row
  when (new.status = 'approved' and old.status is distinct from 'approved' and new.category = 'transfer')
  execute function public.promo_aprovada_notify();

commit;
```

- [ ] **Step 2: Self-check do SQL** (ler o arquivo inteiro)

Conferir: `promo_norm` é `stable` (unaccent não é immutable); todos os `program_id` do seed existem no catálogo (`src/components/programSelectionUtils.ts` PROGRAM_CATEGORY); os `alias_norm` são a saída de `promo_norm` (ex.: `promo_norm('Inter Loop')='interloop'`, `promo_norm('Átomos C6')='atomosc6'`); trigger tem guarda `category='transfer'` + `old.status distinct from 'approved'` (não redispara em re-aprovação idempotente); revoke em todas as tabelas/funcs novas.

- [ ] **Step 3: Commit** (NÃO aplicar)

```bash
git add supabase/migrations/20260712150000_promo_personalizada_proativa.sql
git commit -m "feat(usuario): migration da promoção personalizada proativa (aliases + trigger, aplicar no rollout)"
```

---

### Task 2 (CONTROLLER): Workflow n8n `gm-promo-personalizado` (tempo real)

**Controller-only** (n8n API vivo + Evolution + E2E). Não dispachar subagente.

**Files:**
- Create: `scripts/n8n/gm-promo-personalizado.workflow.json`

**Design do workflow** (nós):
1. **Webhook** (path `gm-promo-personalizado`): valida header `x-webhook-secret`; recebe `{promo_id}`.
2. **Postgres `gmpp-cross`** (`queryReplacement` = `={{ [$json.body.promo_id] }}`): o cross direto —

```sql
with promo as (
  select id, source_program, target_program, bonus_numeric, valid_until
  from promo_alerts
  where id = $1 and category = 'transfer' and status = 'approved'
    and (valid_until is null or valid_until >= current_date)
)
select pc.cliente_id,
       g.grupo_jid,
       coalesce(v.nome_exibicao, pf.nome, pf.nome_completo, 'você') as cliente_nome,
       pc.saldo::bigint as saldo,
       p.source_program as origem,
       p.target_program as destino,
       p.bonus_numeric,
       round(pc.saldo * (1 + p.bonus_numeric / 100.0))::bigint as resultado,
       p.id as promo_id
from promo p
join program_aliases al on al.alias_norm = promo_norm(p.source_program)
join programas_cliente pc on pc.program_id = al.program_id and pc.saldo > 0
join agent_vinculos v on v.cliente_id = pc.cliente_id and v.ativo
join agent_grupos g on g.id = v.grupo_id and g.ativo
left join perfis pf on pf.usuario_id = pc.cliente_id
where p.bonus_numeric is not null
  and not exists (select 1 from agent_preferencias ap
                  where ap.cliente_id = pc.cliente_id and ap.chave = 'promo_optout' and ap.valor = 'true')
  and not exists (select 1 from promo_alert_envios e
                  where e.promo_id = p.id and e.cliente_id = pc.cliente_id and e.canal = 'whatsapp_direto');
```

3. **Code `gmpp-msg`** (`mode: runOnceForEachItem`, pt-BR): monta
   `🎯 *Oportunidade pra você!*\n\nVocê tem *{saldo} {origem}* e saiu *{bonus}% de bônus* pra *{destino}* — daria *~{resultado} {destino}*.\n\nConfira as regras no site do programa antes de transferir.`
   (`saldo`/`resultado` via `Number(x).toLocaleString('pt-BR')`; `bonus` idem).
4. **HTTP `gmpp-send`** (Evolution `POST {api_base}/message/sendText/{instance}`, credencial `CRED_EVOLUTION_HEADER`): `number = grupo_jid`, `text = {{ $json.mensagem }}` (texto por referência 1:1). Tenant piloto: instance `gestmiles_qr`, api_base do `agent_tenants` id 3.
5. **Postgres `gmpp-ledger`** (`queryReplacement = ={{ [$('gmpp-cross').item.json.promo_id, $('gmpp-cross').item.json.cliente_id] }}`): `insert into promo_alert_envios(promo_id, cliente_id, canal) values ($1,$2,'whatsapp_direto') on conflict do nothing;` (INSERT só após o send OK — se o send falhar, não grava e reenvia no próximo gatilho).

**Passos do controller:**
- [ ] Ler workflow existente `scripts/n8n/gm-promo-ingest.workflow.json` como molde (estrutura de nós/credenciais).
- [ ] Construir o JSON acima; push via `node scripts/n8n/push-workflow.mjs scripts/n8n/gm-promo-personalizado.workflow.json`.
- [ ] E2E via clone temporário (trigger Webhook): promo transfer sintética aprovada + carteira de teste com grupo → confirmar msg no Grupo Teste + linha em `promo_alert_envios`; reexecutar → anti-join impede reenvio. Limpar sintéticos.
- [ ] Commit do JSON: `git add scripts/n8n/gm-promo-personalizado.workflow.json && git commit -m "feat(usuario): workflow n8n do alerta direto de promo personalizada"`

---

### Task 3 (CONTROLLER): Workflow n8n `gm-promo-digest-interno` (cron diário)

**Controller-only.**

**Files:**
- Create: `scripts/n8n/gm-promo-digest-interno.workflow.json`

**Design** (nós):
1. **Schedule** (cron diário ~09:00 SP — alinhar com o housekeeping existente).
2. **Postgres `gmpd-cross`** (por tenant ativo; para o piloto, tenant id 3):

```sql
select pc.cliente_id,
       coalesce(pf.nome, pf.nome_completo, 'Cliente') as cliente_nome,
       pc.saldo::bigint as saldo,
       p.source_program as origem,
       p.target_program as destino,
       p.bonus_numeric,
       round(pc.saldo * (1 + p.bonus_numeric / 100.0))::bigint as resultado,
       t.grupo_interno_jid
from agent_tenants t
join perfis pf on pf.equipe_id = t.equipe_id
join programas_cliente pc on pc.cliente_id = pf.usuario_id and pc.saldo > 0
join promo_alerts p on p.category = 'transfer' and p.status = 'approved'
   and p.bonus_numeric is not null
   and p.moderated_at >= now() - interval '24 hours'
   and (p.valid_until is null or p.valid_until >= current_date)
join program_aliases al on al.alias_norm = promo_norm(p.source_program) and al.program_id = pc.program_id
where t.ativo and t.grupo_interno_jid is not null
  and not exists (select 1 from agent_preferencias ap
                  where ap.cliente_id = pc.cliente_id and ap.chave = 'promo_optout' and ap.valor = 'true')
order by t.grupo_interno_jid, resultado desc;
```

3. **Code `gmpd-msg`** (`runOnceForAllItems`): agrupa por `grupo_interno_jid`; monta 1 mensagem por grupo —
   cabeçalho `*📊 Promoções que batem com carteiras (24h)*` + linhas `• {cliente_nome} — {saldo} {origem} → ~{resultado} {destino} ({bonus}%)` (pt-BR). Sem itens → sem output (noop, não manda vazio).
4. **HTTP `gmpd-send`** (Evolution): manda ao `grupo_interno_jid`.

**Passos do controller:**
- [ ] Construir + push (molde: `gm-promo-housekeeping.workflow.json`, que já é cron diário).
- [ ] E2E via clone (schedule→webhook): com transfer sintética aprovada nas últimas 24h + carteira sem grupo → confirmar 1 msg no Grupo Teste com a linha do cliente; opt-out sintético → some da lista. Limpar.
- [ ] Commit do JSON.

---

### Task 4 (CONTROLLER): Rollout (com CHECKPOINT do owner)

**Controller-only. Ordem ESTRITA. Banco compartilhado.**

- [ ] **CHECKPOINT owner:** confirmar OK pra aplicar a migration `20260712150000` no banco compartilhado.
- [ ] Aplicar a migration via MCP `apply_migration` (verificar `unaccent` disponível; conferir tabelas/func/trigger criados; advisors sem ERROR novo).
- [ ] Inserir os 2 secrets no **Vault** (à mão, nunca commitar): `n8n_promo_personalizado_webhook_url` (URL do webhook do workflow) + `n8n_promo_personalizado_webhook_secret` (gerar; casar com a checagem `x-webhook-secret` do Webhook node). ⚠️ `openssl rand` no Git Bash gera CRLF — `tr -d '\r\n'`.
- [ ] Push + **activate** dos 2 workflows (`POST /api/v1/workflows/<id>/activate`).
- [ ] **E2E real controlado:** aprovar 1 transfer sintética (via UPDATE ou pela promo real) com carteira de teste (grupo) → confirmar msg direta no Grupo Teste + `promo_alert_envios`; rodar o digest manual (clone) → confirmar digest. **Limpar todos os sintéticos** (promo, saldo, envios) — prod intocada (padrão do smoke da 3-A).
- [ ] Atualizar memória/ledger; abrir PR com os follow-ups.

---

## Self-Review

- **Cobertura do spec:** trigger (Task 1) ✓; program_aliases+promo_norm (Task 1) ✓; promo_alert_envios/idempotência (Task 1 + Task 2 ledger) ✓; opt-out nos 2 canais (Task 2 e 3 WHERE) ✓; cross transfer×saldo>0 + resultado (Task 2/3) ✓; direto real-time (Task 2) ✓; digest diário (Task 3) ✓; rollout com checkpoint (Task 4) ✓.
- **Sem staging → E2E controlado com sintéticos + cleanup** cobre a verificação (não há unit test de SQL/n8n; é o padrão da Fase C/1).
- **Ordem de rollout** protegida na Task 4 (migration → Vault → push/activate).
