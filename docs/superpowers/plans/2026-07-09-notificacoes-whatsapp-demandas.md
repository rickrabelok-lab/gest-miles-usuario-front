# Notificações WhatsApp de Demandas (Fase C) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando o cliente solicita cotação no app, o grupo de WhatsApp dele recebe "demanda registrada"; e o grupo interno da equipe recebe um resumo diário de demandas (seg–sex 08:30).

**Architecture:** Trigger `AFTER INSERT` em `demandas_cliente` (filtrado por `origem_registro='app_cliente'`, carimbado pela RPC) faz `net.http_post` pro webhook do n8n, que resolve o grupo no banco do agente e envia via Evolution API. Resumo diário: workflow cron n8n lê rota nova do BFF Express (service role, guard `x-api-key`) e envia pro grupo interno do tenant.

**Tech Stack:** Postgres (pg_net + Vault, projeto Supabase compartilhado `jntkpcjmmnaghmimdcam`), Express 4 (BFF, `node --test`), n8n (`https://n8n.gestmiles.com.br`), Evolution API v2.

**Spec:** `docs/superpowers/specs/2026-07-09-notificacoes-whatsapp-demandas-design.md`

## Global Constraints

- Branch de trabalho: `feat/notificacoes-whatsapp-demandas` (já criada; spec commitada em `e170909`).
- **NUNCA aplicar a migration no banco remoto durante a implementação** — banco compartilhado de produção, sem staging. Aplicação só no rollout (seção final), com confirmação explícita do owner na hora.
- Nenhum segredo em código ou em var `VITE_`. Secrets: Vault (Postgres) e `backend/.env`/Vercel.
- Backend testa com `node --test` (não Vitest): `cd backend && npm test`.
- Pasta do agente: `C:\Users\rick_\Downloads\gestmiles-agente-whatsapp\` — workflows n8n novos vivem LÁ (fora deste repo). Placeholders de credencial no JSON (`CRED_POSTGRES_AGENTE`, `CRED_EVOLUTION_HEADER`, etc.), substituídos no import via script.
- Mensagens em PT-BR; campos ausentes somem da mensagem (nunca imprimir `null`/`undefined`).
- Commits em PT-BR com escopo (`feat(backend):`, `feat(usuario):` etc.), terminando com `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Agregação pura do resumo de demandas (backend)

**Files:**
- Create: `backend/src/lib/demandasResumo.js`
- Test: `backend/src/lib/demandasResumo.test.js`

**Interfaces:**
- Consumes: nada (função pura).
- Produces: `buildDemandasResumo(rows, { agora = new Date() } = {})` → `{ equipes: [{ equipe_id, contagens: { novas_24h, pendentes, em_andamento, paradas_3d }, demandas: [{ id, cliente_nome, tipo, status, resumo_curto, dias_parada }] }] }`. `rows` são objetos `{ id, cliente_id, tipo, status, payload, created_at, updated_at, cliente_nome, equipe_id }`.

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `backend/src/lib/demandasResumo.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDemandasResumo } from "./demandasResumo.js";

// Agregação por equipe do resumo diário (workflow gm-resumo-demandas).
// `agora` é injetado pra tornar as janelas de 24h/3d determinísticas.

const AGORA = new Date("2026-07-09T11:30:00Z");
const h = (horas) => new Date(AGORA.getTime() - horas * 3_600_000).toISOString();

function linha(extra) {
  return {
    id: 1,
    cliente_id: "c1",
    tipo: "emissao",
    status: "pendente",
    payload: { origem: "GRU", destino: "LIS" },
    created_at: h(2),
    updated_at: h(2),
    cliente_nome: "João",
    equipe_id: "eq-1",
    ...extra,
  };
}

test("agrupa por equipe e calcula as 4 contagens", () => {
  const rows = [
    linha({ id: 1, created_at: h(2), updated_at: h(2) }), // nova + pendente
    linha({ id: 2, status: "em_andamento", created_at: h(30), updated_at: h(30) }),
    linha({ id: 3, status: "pendente", created_at: h(100), updated_at: h(100) }), // parada 3d+
    linha({ id: 4, equipe_id: "eq-2", created_at: h(1), updated_at: h(1) }),
  ];
  const out = buildDemandasResumo(rows, { agora: AGORA });
  assert.equal(out.equipes.length, 2);
  const eq1 = out.equipes.find((e) => e.equipe_id === "eq-1");
  assert.deepEqual(eq1.contagens, { novas_24h: 1, pendentes: 2, em_andamento: 1, paradas_3d: 1 });
  const eq2 = out.equipes.find((e) => e.equipe_id === "eq-2");
  assert.deepEqual(eq2.contagens, { novas_24h: 1, pendentes: 1, em_andamento: 0, paradas_3d: 0 });
});

test("concluída recente conta em novas_24h mas não entra na lista de demandas", () => {
  const rows = [linha({ id: 9, status: "concluida", created_at: h(3), updated_at: h(1) })];
  const out = buildDemandasResumo(rows, { agora: AGORA });
  assert.equal(out.equipes[0].contagens.novas_24h, 1);
  assert.equal(out.equipes[0].contagens.pendentes, 0);
  assert.deepEqual(out.equipes[0].demandas, []);
});

test("resumo_curto: emissão vira rota; outros vira categoria; fallbacks sem null", () => {
  const rows = [
    linha({ id: 1 }),
    linha({ id: 2, tipo: "outros", payload: { categoria: "hotel" } }),
    linha({ id: 3, tipo: "outros", payload: {} }),
    linha({ id: 4, payload: {} }),
  ];
  const out = buildDemandasResumo(rows, { agora: AGORA });
  const curtos = out.equipes[0].demandas.map((d) => d.resumo_curto).sort();
  assert.deepEqual(curtos, ["GRU → LIS", "emissão", "hotel", "outros"]);
});

test("demandas ordenadas por dias_parada desc e equipe_id null agrupa junto", () => {
  const rows = [
    linha({ id: 1, equipe_id: null, updated_at: h(1) }),
    linha({ id: 2, equipe_id: null, updated_at: h(120) }),
  ];
  const out = buildDemandasResumo(rows, { agora: AGORA });
  assert.equal(out.equipes.length, 1);
  assert.equal(out.equipes[0].equipe_id, null);
  assert.deepEqual(out.equipes[0].demandas.map((d) => d.id), [2, 1]);
  assert.equal(out.equipes[0].demandas[0].dias_parada, 5);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd backend && node --test src/lib/demandasResumo.test.js`
Expected: FAIL (`Cannot find module ... demandasResumo.js`)

- [ ] **Step 3: Implementar `backend/src/lib/demandasResumo.js`**

```js
// Agrega demandas por equipe pro resumo diário do grupo interno (workflow n8n
// gm-resumo-demandas). Função pura: recebe linhas já enriquecidas com
// cliente_nome/equipe_id e devolve contagens + lista curta por equipe.

const DIA_MS = 86_400_000;

function resumoCurto(tipo, payload) {
  const p = payload ?? {};
  if (tipo === "emissao") {
    const rota = [p.origem, p.destino].filter(Boolean).join(" → ");
    return rota || "emissão";
  }
  return p.categoria || "outros";
}

export function buildDemandasResumo(rows, { agora = new Date() } = {}) {
  const porEquipe = new Map();
  for (const row of rows ?? []) {
    const equipeId = row.equipe_id ?? null;
    if (!porEquipe.has(equipeId)) {
      porEquipe.set(equipeId, {
        equipe_id: equipeId,
        contagens: { novas_24h: 0, pendentes: 0, em_andamento: 0, paradas_3d: 0 },
        demandas: [],
      });
    }
    const eq = porEquipe.get(equipeId);
    const createdAt = new Date(row.created_at);
    const updatedAt = new Date(row.updated_at ?? row.created_at);
    const ativa = row.status === "pendente" || row.status === "em_andamento";
    const diasParada = Math.max(0, Math.floor((agora - updatedAt) / DIA_MS));

    if (agora - createdAt < DIA_MS) eq.contagens.novas_24h += 1;
    if (row.status === "pendente") eq.contagens.pendentes += 1;
    if (row.status === "em_andamento") eq.contagens.em_andamento += 1;
    if (ativa && diasParada >= 3) eq.contagens.paradas_3d += 1;

    if (ativa) {
      eq.demandas.push({
        id: row.id,
        cliente_nome: row.cliente_nome ?? null,
        tipo: row.tipo,
        status: row.status,
        resumo_curto: resumoCurto(row.tipo, row.payload),
        dias_parada: diasParada,
      });
    }
  }
  const equipes = [...porEquipe.values()];
  for (const eq of equipes) eq.demandas.sort((a, b) => b.dias_parada - a.dias_parada);
  return { equipes };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd backend && node --test src/lib/demandasResumo.test.js`
Expected: PASS (4 testes)

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/demandasResumo.js backend/src/lib/demandasResumo.test.js
git commit -m "feat(backend): agregação pura do resumo diário de demandas por equipe

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Guard de API key + rota `GET /api/agent/demandas-resumo` (backend)

**Files:**
- Create: `backend/src/lib/agentAuth.js`
- Create: `backend/src/routes/agentResumo.js`
- Modify: `backend/src/index.js` (import na seção de imports ~linha 22; mount após a linha 96 `routes.use("/api/account", ...)`)
- Modify: `backend/.env.example` (append)
- Test: `backend/src/lib/agentAuth.test.js`

**Interfaces:**
- Consumes: `buildDemandasResumo` (Task 1), `supabaseService`/`assertSupabaseService` de `../lib/supabaseService.js`, `serverError` de `../lib/httpError.js`.
- Produces: `agentKeyStatus(providedKey, envKey)` → `"ok" | "missing_env" | "mismatch"`; rota `GET /api/agent/demandas-resumo` → 200 `{ gerado_em, equipes: [...] }` | 401 | 503.

- [ ] **Step 1: Teste do guard (falhando)**

Criar `backend/src/lib/agentAuth.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { agentKeyStatus } from "./agentAuth.js";

// Guard do canal server-to-server (n8n → BFF): sem env configurada o endpoint
// fica fechado (503), chave errada é 401, chave certa passa.

test("sem AGENT_API_KEY no env: missing_env (endpoint fechado)", () => {
  assert.equal(agentKeyStatus("qualquer", undefined), "missing_env");
  assert.equal(agentKeyStatus("qualquer", ""), "missing_env");
  assert.equal(agentKeyStatus("qualquer", "   "), "missing_env");
});

test("chave errada, ausente ou com tamanho diferente: mismatch", () => {
  assert.equal(agentKeyStatus("errada", "certa"), "mismatch");
  assert.equal(agentKeyStatus(undefined, "certa"), "mismatch");
  assert.equal(agentKeyStatus("", "certa"), "mismatch");
});

test("chave certa (com espaços nas pontas tolerados): ok", () => {
  assert.equal(agentKeyStatus("chave-123", "chave-123"), "ok");
  assert.equal(agentKeyStatus(" chave-123 ", "chave-123"), "ok");
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd backend && node --test src/lib/agentAuth.test.js`
Expected: FAIL (`Cannot find module ... agentAuth.js`)

- [ ] **Step 3: Implementar `backend/src/lib/agentAuth.js`**

```js
import { timingSafeEqual } from "node:crypto";

// Guard do canal server-to-server (n8n → BFF). A chave vive só em env do
// backend e em credencial do n8n — nunca no front. Comparação em tempo
// constante pra não vazar tamanho/prefixo por timing.
export function agentKeyStatus(providedKey, envKey) {
  const expected = (envKey ?? "").trim();
  if (!expected) return "missing_env";
  const a = Buffer.from((providedKey ?? "").trim());
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return "mismatch";
  return "ok";
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd backend && node --test src/lib/agentAuth.test.js`
Expected: PASS (3 testes)

- [ ] **Step 5: Criar a rota `backend/src/routes/agentResumo.js`**

```js
import { Router } from "express";
import { assertSupabaseService } from "../lib/supabaseService.js";
import { serverError } from "../lib/httpError.js";
import { agentKeyStatus } from "../lib/agentAuth.js";
import { buildDemandasResumo } from "../lib/demandasResumo.js";

const router = Router();

/**
 * GET /api/agent/demandas-resumo — consumo server-to-server (workflow n8n
 * gm-resumo-demandas). Auth: header x-api-key === AGENT_API_KEY (sem sessão
 * de usuário). Lê via service role: demandas ativas + criadas nas últimas 24h.
 */
router.get("/demandas-resumo", async (req, res) => {
  try {
    const keyStatus = agentKeyStatus(req.get("x-api-key"), process.env.AGENT_API_KEY);
    if (keyStatus === "missing_env") {
      return res.status(503).json({ error: "AGENT_API_KEY não configurada no servidor." });
    }
    if (keyStatus === "mismatch") {
      return res.status(401).json({ error: "API key inválida." });
    }

    const supabase = assertSupabaseService();
    const cutoff = new Date(Date.now() - 86_400_000).toISOString();
    const { data: demandas, error } = await supabase
      .from("demandas_cliente")
      .select("id, cliente_id, tipo, status, payload, created_at, updated_at")
      .or(`status.in.(pendente,em_andamento),created_at.gte.${cutoff}`)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      return serverError(res, "Erro ao ler demandas", error, "[agent-resumo]");
    }

    const clienteIds = [...new Set((demandas ?? []).map((d) => d.cliente_id))];
    let perfisById = new Map();
    if (clienteIds.length > 0) {
      const { data: perfis, error: perfisError } = await supabase
        .from("perfis")
        .select("usuario_id, nome, nome_completo, equipe_id")
        .in("usuario_id", clienteIds);
      if (perfisError) {
        return serverError(res, "Erro ao ler perfis", perfisError, "[agent-resumo]");
      }
      perfisById = new Map((perfis ?? []).map((p) => [p.usuario_id, p]));
    }

    const rows = (demandas ?? []).map((d) => {
      const perfil = perfisById.get(d.cliente_id);
      const nome = (perfil?.nome ?? "").trim() || perfil?.nome_completo || null;
      return { ...d, cliente_nome: nome, equipe_id: perfil?.equipe_id ?? null };
    });

    return res.json({ gerado_em: new Date().toISOString(), ...buildDemandasResumo(rows) });
  } catch (err) {
    return serverError(res, "Erro ao montar resumo de demandas", err, "[agent-resumo]");
  }
});

export default router;
```

- [ ] **Step 6: Montar a rota no `backend/src/index.js`**

Adicionar ao bloco de imports (junto dos outros routes, após a linha `import accountDeletionRoutes from "./routes/accountDeletion.js";`):

```js
import agentResumoRoutes from "./routes/agentResumo.js";
```

Adicionar após `routes.use("/api/account", accountDeletionRoutes);`:

```js
routes.use("/api/agent", agentResumoRoutes);
```

- [ ] **Step 7: Documentar a env — append em `backend/.env.example`**

```bash
# Fase C — resumo de demandas pro n8n (server-to-server). Gere uma chave longa
# aleatória (ex.: openssl rand -hex 32) e cadastre a MESMA em credencial do n8n.
AGENT_API_KEY=
```

- [ ] **Step 8: Verificação manual da rota (smoke local)**

```bash
cd backend && AGENT_API_KEY=teste-local npm run dev &
sleep 3
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/agent/demandas-resumo            # espera 401
curl -s -H "x-api-key: teste-local" http://localhost:3000/api/agent/demandas-resumo | head -c 300   # espera 200 + JSON {"gerado_em":...}
kill %1
```

(Se `backend/.env` não tiver `SUPABASE_SERVICE_ROLE_KEY`, o segundo curl retorna 500 com mensagem de service role — aceitável no dev; a validação plena acontece no rollout.)

- [ ] **Step 9: Rodar toda a suíte do backend e commit**

Run: `cd backend && npm test`
Expected: PASS (suites existentes + 7 novas)

```bash
git add backend/src/lib/agentAuth.js backend/src/lib/agentAuth.test.js backend/src/routes/agentResumo.js backend/src/index.js backend/.env.example
git commit -m "feat(backend): rota /api/agent/demandas-resumo com guard x-api-key p/ workflow n8n

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Migration — carimbo de origem + trigger de webhook (este repo, NÃO aplicar)

**Files:**
- Create: `supabase/migrations/20260709120000_demanda_app_notify_whatsapp.sql`

**Interfaces:**
- Consumes: RPC existente `cliente_criar_demanda` (migration `20260517203529`), `perfis`, extensões `pg_net` + Vault (já instaladas — verificado 2026-07-09).
- Produces: payload de demanda do app ganha `origem_registro='app_cliente'`; POST no webhook n8n com o contrato JSON da spec (seção C1).

- [ ] **Step 1: Escrever a migration (arquivo completo)**

```sql
-- Fase C (agente WhatsApp): notificação de demanda registrada pelo app.
-- 1) cliente_criar_demanda carimba origem_registro='app_cliente' no payload.
-- 2) Trigger AFTER INSERT em demandas_cliente envia webhook pro n8n (pg_net)
--    SOMENTE pra demandas do app. URL/secret vivem no Vault (inseridos à mão,
--    nunca commitados); sem secrets configurados o trigger é no-op.
-- Rollback: drop trigger trg_demanda_app_notify_whatsapp on public.demandas_cliente;
--           drop function public.demanda_app_notify_whatsapp();
--           recriar cliente_criar_demanda da migration 20260517203529.
begin;

create or replace function public.cliente_criar_demanda(
  p_cliente_id uuid,
  p_tipo text,
  p_payload jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_tipo text := nullif(trim(coalesce(p_tipo, '')), '');
  v_id bigint;
begin
  if v_actor is null then
    raise exception 'cliente_demanda_unauthenticated' using errcode = '42501';
  end if;

  if p_cliente_id is null or v_tipo not in ('emissao', 'outros') or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'cliente_demanda_invalid_input' using errcode = '23514';
  end if;

  if not public.can_manage_client(p_cliente_id) then
    raise exception 'cliente_demanda_forbidden' using errcode = '42501';
  end if;

  -- Carimbo à direita do || : sobrescreve qualquer origem_registro vindo do cliente.
  insert into public.demandas_cliente(cliente_id, tipo, status, payload)
  values (p_cliente_id, v_tipo, 'pendente', p_payload || jsonb_build_object('origem_registro', 'app_cliente'))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.cliente_criar_demanda(uuid, text, jsonb) from public, anon;
grant execute on function public.cliente_criar_demanda(uuid, text, jsonb) to authenticated, service_role;

create or replace function public.demanda_app_notify_whatsapp()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_url text;
  v_secret text;
  v_nome text;
  v_equipe uuid;
  v_body jsonb;
begin
  if coalesce(new.payload->>'origem_registro', '') <> 'app_cliente' then
    return new;
  end if;

  begin
    select decrypted_secret into v_url
      from vault.decrypted_secrets where name = 'n8n_demanda_webhook_url';
    select decrypted_secret into v_secret
      from vault.decrypted_secrets where name = 'n8n_demanda_webhook_secret';
    if v_url is null or v_secret is null then
      return new; -- infra de notificação ainda não configurada: no-op silencioso
    end if;

    select coalesce(nullif(trim(p.nome), ''), p.nome_completo), p.equipe_id
      into v_nome, v_equipe
      from public.perfis p
     where p.usuario_id = new.cliente_id
     limit 1;

    v_body := jsonb_build_object(
      'evento', 'demanda_registrada',
      'demanda_id', new.id,
      'cliente_id', new.cliente_id,
      'cliente_nome', v_nome,
      'equipe_id', v_equipe,
      'tipo', new.tipo,
      'status', new.status,
      'created_at', new.created_at,
      'gestor_id', nullif(new.payload->>'targetGestorId', ''),
      'resumo', jsonb_build_object(
        'origem', new.payload->>'origem',
        'destino', new.payload->>'destino',
        'dataIda', new.payload->>'dataIda',
        'dataVolta', new.payload->>'dataVolta',
        'passageiros', new.payload->'passageiros',
        'classeVoo', new.payload->>'classeVoo',
        'escopo', coalesce(new.payload->>'escopo', new.payload->>'escopoVoo'),
        'categoria', new.payload->>'categoria',
        'detalhes', new.payload->>'detalhes'
      )
    );

    perform net.http_post(
      url := v_url,
      body := v_body,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', v_secret
      )
    );
  exception when others then
    -- Notificação é best-effort: NUNCA derruba a criação da demanda.
    raise warning 'demanda_app_notify_whatsapp falhou (demanda %): %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

revoke all on function public.demanda_app_notify_whatsapp() from public, anon, authenticated;

drop trigger if exists trg_demanda_app_notify_whatsapp on public.demandas_cliente;
create trigger trg_demanda_app_notify_whatsapp
  after insert on public.demandas_cliente
  for each row execute function public.demanda_app_notify_whatsapp();

commit;
```

- [ ] **Step 2: Revisar contra o checklist de segurança Supabase**

Conferir no arquivo escrito: `security definer` com `search_path` travado nas duas funções; `revoke` da função de trigger pra `public/anon/authenticated` (não é RPC exposta); nenhuma policy nova; nenhum segredo no SQL. Trigger só age no caminho `app_cliente`.

- [ ] **Step 3: Commit (sem aplicar!)**

```bash
git add supabase/migrations/20260709120000_demanda_app_notify_whatsapp.sql
git commit -m "feat(usuario): migration da notificação WhatsApp de demanda do app (carimbo origem + trigger pg_net)

NÃO aplicada — aplicar no rollout com confirmação do owner (banco compartilhado).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Banco do agente — coluna `grupo_interno_jid` (pasta do agente)

**Files:**
- Create: `C:\Users\rick_\Downloads\gestmiles-agente-whatsapp\sql\fase-c-grupo-interno.sql`
- Modify: `C:\Users\rick_\Downloads\gestmiles-agente-whatsapp\sql\agente-schema.sql` (append na seção de tenants)

**Interfaces:**
- Produces: `agent_tenants.grupo_interno_jid text` — usado pelos dois workflows (Tasks 5 e 6).

- [ ] **Step 1: Criar `sql/fase-c-grupo-interno.sql`** (pra rodar no Postgres do agente, que NÃO é o banco do GestMiles)

```sql
-- Fase C: grupo operacional interno da equipe (fallback "cliente sem grupo"
-- + resumo diário). Rodar no Postgres do AGENTE (n8n), não no GestMiles.
alter table agent_tenants add column if not exists grupo_interno_jid text;
comment on column agent_tenants.grupo_interno_jid is
  'JID (...@g.us) do grupo interno da equipe. NULL = fase C muda pra log-only nesse tenant.';

-- Onboarding manual (exemplo — ajustar valores reais):
-- update agent_tenants set grupo_interno_jid = '120363000000000099@g.us' where instance = 'gestmiles-principal';
```

- [ ] **Step 2: Refletir a coluna em `sql/agente-schema.sql`**

Na `create table agent_tenants (...)`, adicionar após a linha `equipe_id    uuid,                        -- id da equipe no GestMiles`:

```sql
  grupo_interno_jid text,                    -- fase C: grupo interno da equipe (fallback + resumo diário)
```

- [ ] **Step 3: Versionar (se a pasta for repo git)**

```bash
git -C "/c/Users/rick_/Downloads/gestmiles-agente-whatsapp" rev-parse --git-dir 2>/dev/null && \
  git -C "/c/Users/rick_/Downloads/gestmiles-agente-whatsapp" add sql/ && \
  git -C "/c/Users/rick_/Downloads/gestmiles-agente-whatsapp" commit -m "feat: fase C — coluna grupo_interno_jid em agent_tenants" || \
  echo "pasta não é repo git — arquivos salvos, sem commit"
```

---

### Task 5: Workflow n8n `gm-notificar-demanda` (JSON completo, pasta do agente)

**Files:**
- Create: `C:\Users\rick_\Downloads\gestmiles-agente-whatsapp\workflow-notificar-demanda.json`

**Interfaces:**
- Consumes: contrato do webhook (Task 3, body JSON `evento/demanda_id/cliente_id/cliente_nome/equipe_id/tipo/resumo`); banco do agente (`agent_vinculos/agent_grupos/agent_tenants` + coluna da Task 4).
- Produces: workflow importável com placeholders `CRED_WEBHOOK_DEMANDA` (Header Auth do webhook), `CRED_POSTGRES_AGENTE`, `CRED_EVOLUTION_HEADER`. Path do webhook: `gm-demanda-registrada`.

- [ ] **Step 1: Criar o arquivo JSON completo**

```json
{
  "name": "GM Fase C — Notificar Demanda Registrada",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "gm-demanda-registrada",
        "authentication": "headerAuth",
        "responseMode": "onReceived",
        "options": {}
      },
      "id": "gmfc-webhook",
      "name": "Webhook Demanda",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [0, 300],
      "credentials": {
        "httpHeaderAuth": { "id": "CRED_WEBHOOK_DEMANDA", "name": "CRED_WEBHOOK_DEMANDA" }
      },
      "notes": "Header Auth: nome do header x-webhook-secret, valor = secret do Vault do GestMiles."
    },
    {
      "parameters": {
        "operation": "executeQuery",
        "query": "SELECT g.grupo_jid, t.server_url, t.instance FROM agent_vinculos v JOIN agent_grupos g ON g.id = v.grupo_id AND g.ativo JOIN agent_tenants t ON t.id = g.tenant_id AND t.ativo WHERE v.cliente_id = $1::uuid AND v.tipo = 'cliente' AND v.ativo AND (coalesce($2,'') = '' OR t.equipe_id::text = $2) ORDER BY g.id LIMIT 1;",
        "options": {
          "queryReplacement": "={{ $json.body.cliente_id }},{{ $json.body.equipe_id || '' }}"
        }
      },
      "id": "gmfc-grupo-cliente",
      "name": "Buscar Grupo Cliente",
      "type": "n8n-nodes-base.postgres",
      "typeVersion": 2.4,
      "position": [220, 300],
      "alwaysOutputData": true,
      "credentials": {
        "postgres": { "id": "CRED_POSTGRES_AGENTE", "name": "CRED_POSTGRES_AGENTE" }
      }
    },
    {
      "parameters": {
        "conditions": {
          "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "loose" },
          "conditions": [
            {
              "leftValue": "={{ $json.grupo_jid }}",
              "rightValue": "",
              "operator": { "type": "string", "operation": "notEmpty", "singleValue": true }
            }
          ],
          "combinator": "and"
        },
        "options": {}
      },
      "id": "gmfc-if-grupo",
      "name": "Grupo Encontrado?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2.2,
      "position": [440, 300]
    },
    {
      "parameters": {
        "jsCode": "const b = $('Webhook Demanda').first().json.body;\nconst r = b.resumo || {};\nconst fmt = (ymd) => {\n  if (!ymd) return null;\n  const [a, m, d] = String(ymd).split('-');\n  return (a && m && d) ? `${d}/${m}` : String(ymd);\n};\nconst linhas = [];\nlinhas.push('\\u2708\\uFE0F *Demanda registrada!*');\nlinhas.push('');\nlinhas.push(`*${b.cliente_nome || 'Cliente'}*, recebemos sua solicita\\u00e7\\u00e3o de cota\\u00e7\\u00e3o:`);\nif (b.tipo === 'emissao') {\n  const rota = [r.origem, r.destino].filter(Boolean).join(' \\u2192 ');\n  if (rota) linhas.push(`\\uD83D\\uDCCD ${rota}`);\n  const datas = [fmt(r.dataIda) ? `Ida ${fmt(r.dataIda)}` : null, fmt(r.dataVolta) ? `Volta ${fmt(r.dataVolta)}` : null].filter(Boolean).join(' \\u00b7 ');\n  const extras = [datas || null, r.passageiros ? `\\uD83D\\uDC65 ${r.passageiros} pax` : null, r.classeVoo || null].filter(Boolean).join(' \\u00b7 ');\n  if (extras) linhas.push(`\\uD83D\\uDCC5 ${extras}`);\n} else {\n  const oq = [r.categoria, r.detalhes].filter(Boolean).join(' \\u2014 ');\n  if (oq) linhas.push(`\\uD83D\\uDCDD ${oq}`);\n}\nlinhas.push('');\nlinhas.push('Nosso time j\\u00e1 est\\u00e1 cuidando disso \\u2014 em breve seu gestor te retorna por aqui. \\uD83D\\uDE4C');\nreturn [{ json: { texto: linhas.join('\\n'), grupo_jid: $json.grupo_jid, server_url: $json.server_url, instance: $json.instance } }];"
      },
      "id": "gmfc-msg-cliente",
      "name": "Montar Mensagem Cliente",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [660, 180]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "={{ $json.server_url }}/message/sendText/{{ $json.instance }}",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendBody": true,
        "bodyParameters": {
          "parameters": [
            { "name": "number", "value": "={{ $json.grupo_jid }}" },
            { "name": "text", "value": "={{ $json.texto }}" }
          ]
        },
        "options": {}
      },
      "id": "gmfc-evo-cliente",
      "name": "(EVO) Enviar no Grupo do Cliente",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [880, 180],
      "credentials": {
        "httpHeaderAuth": { "id": "CRED_EVOLUTION_HEADER", "name": "CRED_EVOLUTION_HEADER" }
      }
    },
    {
      "parameters": {
        "operation": "executeQuery",
        "query": "SELECT t.grupo_interno_jid, t.server_url, t.instance FROM agent_tenants t WHERE t.ativo AND t.grupo_interno_jid IS NOT NULL AND (coalesce($1,'') = '' OR t.equipe_id::text = $1) ORDER BY t.id LIMIT 1;",
        "options": {
          "queryReplacement": "={{ $('Webhook Demanda').first().json.body.equipe_id || '' }}"
        }
      },
      "id": "gmfc-grupo-interno",
      "name": "Buscar Grupo Interno",
      "type": "n8n-nodes-base.postgres",
      "typeVersion": 2.4,
      "position": [660, 420],
      "alwaysOutputData": true,
      "credentials": {
        "postgres": { "id": "CRED_POSTGRES_AGENTE", "name": "CRED_POSTGRES_AGENTE" }
      }
    },
    {
      "parameters": {
        "conditions": {
          "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "loose" },
          "conditions": [
            {
              "leftValue": "={{ $json.grupo_interno_jid }}",
              "rightValue": "",
              "operator": { "type": "string", "operation": "notEmpty", "singleValue": true }
            }
          ],
          "combinator": "and"
        },
        "options": {}
      },
      "id": "gmfc-if-interno",
      "name": "Tem Grupo Interno?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2.2,
      "position": [880, 420]
    },
    {
      "parameters": {
        "jsCode": "const b = $('Webhook Demanda').first().json.body;\nconst r = b.resumo || {};\nconst resumoCurto = b.tipo === 'emissao'\n  ? ([r.origem, r.destino].filter(Boolean).join(' \\u2192 ') || 'emiss\\u00e3o')\n  : (r.categoria || 'outros');\nconst texto = [\n  `\\u26A0\\uFE0F *Demanda #${b.demanda_id} sem grupo de WhatsApp*`,\n  `Cliente: ${b.cliente_nome || b.cliente_id}`,\n  `Tipo: ${b.tipo} \\u2014 ${resumoCurto}`,\n  'Registrada pelo app \\u2014 avisar o cliente manualmente.',\n].join('\\n');\nreturn [{ json: { texto, grupo_jid: $json.grupo_interno_jid, server_url: $json.server_url, instance: $json.instance } }];"
      },
      "id": "gmfc-msg-interno",
      "name": "Montar Alerta Interno",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [1100, 360]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "={{ $json.server_url }}/message/sendText/{{ $json.instance }}",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendBody": true,
        "bodyParameters": {
          "parameters": [
            { "name": "number", "value": "={{ $json.grupo_jid }}" },
            { "name": "text", "value": "={{ $json.texto }}" }
          ]
        },
        "options": {}
      },
      "id": "gmfc-evo-interno",
      "name": "(EVO) Enviar no Grupo Interno",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [1320, 360],
      "credentials": {
        "httpHeaderAuth": { "id": "CRED_EVOLUTION_HEADER", "name": "CRED_EVOLUTION_HEADER" }
      }
    },
    {
      "parameters": {},
      "id": "gmfc-noop",
      "name": "Sem Destino (log)",
      "type": "n8n-nodes-base.noOp",
      "typeVersion": 1,
      "position": [1100, 540],
      "notes": "Cliente sem grupo E tenant sem grupo interno: só registra na execução."
    }
  ],
  "connections": {
    "Webhook Demanda": { "main": [[{ "node": "Buscar Grupo Cliente", "type": "main", "index": 0 }]] },
    "Buscar Grupo Cliente": { "main": [[{ "node": "Grupo Encontrado?", "type": "main", "index": 0 }]] },
    "Grupo Encontrado?": {
      "main": [
        [{ "node": "Montar Mensagem Cliente", "type": "main", "index": 0 }],
        [{ "node": "Buscar Grupo Interno", "type": "main", "index": 0 }]
      ]
    },
    "Montar Mensagem Cliente": { "main": [[{ "node": "(EVO) Enviar no Grupo do Cliente", "type": "main", "index": 0 }]] },
    "Buscar Grupo Interno": { "main": [[{ "node": "Tem Grupo Interno?", "type": "main", "index": 0 }]] },
    "Tem Grupo Interno?": {
      "main": [
        [{ "node": "Montar Alerta Interno", "type": "main", "index": 0 }],
        [{ "node": "Sem Destino (log)", "type": "main", "index": 0 }]
      ]
    },
    "Montar Alerta Interno": { "main": [[{ "node": "(EVO) Enviar no Grupo Interno", "type": "main", "index": 0 }]] }
  },
  "settings": { "executionOrder": "v1" }
}
```

- [ ] **Step 2: Validar o JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('C:/Users/rick_/Downloads/gestmiles-agente-whatsapp/workflow-notificar-demanda.json','utf8')); console.log('JSON ok')"`
Expected: `JSON ok`

- [ ] **Step 3: Versionar na pasta do agente** (mesmo padrão da Task 4 Step 3, mensagem `feat: fase C — workflow gm-notificar-demanda`)

---

### Task 6: Workflow n8n `gm-resumo-demandas` (JSON completo, pasta do agente)

**Files:**
- Create: `C:\Users\rick_\Downloads\gestmiles-agente-whatsapp\workflow-resumo-demandas.json`

**Interfaces:**
- Consumes: rota da Task 2 (`GET {BFF_BASE_URL}/api/agent/demandas-resumo` → `{ gerado_em, equipes: [{ equipe_id, contagens, demandas }] }`); banco do agente (Task 4).
- Produces: workflow importável com placeholders `BFF_BASE_URL` (URL, substituída no import), `CRED_RESUMO_APIKEY` (Header Auth `x-api-key`), `CRED_POSTGRES_AGENTE`, `CRED_EVOLUTION_HEADER`.

- [ ] **Step 1: Criar o arquivo JSON completo**

```json
{
  "name": "GM Fase C — Resumo Diário de Demandas",
  "nodes": [
    {
      "parameters": {
        "rule": {
          "interval": [{ "field": "cronExpression", "expression": "30 8 * * 1-5" }]
        }
      },
      "id": "gmfc2-agenda",
      "name": "Agenda (seg–sex 08:30)",
      "type": "n8n-nodes-base.scheduleTrigger",
      "typeVersion": 1.2,
      "position": [0, 300]
    },
    {
      "parameters": {
        "method": "GET",
        "url": "BFF_BASE_URL/api/agent/demandas-resumo",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "options": {}
      },
      "id": "gmfc2-bff",
      "name": "Buscar Resumo (BFF)",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [220, 300],
      "credentials": {
        "httpHeaderAuth": { "id": "CRED_RESUMO_APIKEY", "name": "CRED_RESUMO_APIKEY" }
      },
      "notes": "Header Auth: nome x-api-key, valor = AGENT_API_KEY do backend."
    },
    {
      "parameters": { "fieldToSplitOut": "equipes", "options": {} },
      "id": "gmfc2-split",
      "name": "Separar Equipes",
      "type": "n8n-nodes-base.splitOut",
      "typeVersion": 1,
      "position": [440, 300]
    },
    {
      "parameters": {
        "operation": "executeQuery",
        "query": "SELECT t.grupo_interno_jid, t.server_url, t.instance FROM agent_tenants t WHERE t.ativo AND t.grupo_interno_jid IS NOT NULL AND (coalesce($1,'') = '' OR t.equipe_id::text = $1) ORDER BY t.id LIMIT 1;",
        "options": { "queryReplacement": "={{ $json.equipe_id || '' }}" }
      },
      "id": "gmfc2-grupo-interno",
      "name": "Buscar Grupo Interno",
      "type": "n8n-nodes-base.postgres",
      "typeVersion": 2.4,
      "position": [660, 300],
      "alwaysOutputData": true,
      "credentials": {
        "postgres": { "id": "CRED_POSTGRES_AGENTE", "name": "CRED_POSTGRES_AGENTE" }
      }
    },
    {
      "parameters": {
        "conditions": {
          "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "loose" },
          "conditions": [
            {
              "leftValue": "={{ $json.grupo_interno_jid }}",
              "rightValue": "",
              "operator": { "type": "string", "operation": "notEmpty", "singleValue": true }
            }
          ],
          "combinator": "and"
        },
        "options": {}
      },
      "id": "gmfc2-if-interno",
      "name": "Tem Grupo Interno?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2.2,
      "position": [880, 300]
    },
    {
      "parameters": {
        "jsCode": "const eq = $('Separar Equipes').item.json;\nconst c = eq.contagens || {};\nconst dias = ['dom','seg','ter','qua','qui','sex','s\\u00e1b'];\nconst agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));\nconst data = `${dias[agora.getDay()]}, ${String(agora.getDate()).padStart(2,'0')}/${String(agora.getMonth()+1).padStart(2,'0')}`;\nconst lista = (arr, titulo) => {\n  if (!arr || !arr.length) return [];\n  const top = arr.slice(0, 10).map(d => `\\u2022 #${d.id} ${d.cliente_nome || '?'} \\u2014 ${d.resumo_curto}${d.dias_parada >= 1 ? ` (h\\u00e1 ${d.dias_parada}d)` : ''}`);\n  const resto = arr.length > 10 ? [`\\u2026e mais ${arr.length - 10}`] : [];\n  return ['', `*${titulo}:*`, ...top, ...resto];\n};\nconst pend = (eq.demandas || []).filter(d => d.status === 'pendente');\nconst and = (eq.demandas || []).filter(d => d.status === 'em_andamento');\nconst texto = [\n  `\\uD83D\\uDCCB *Resumo de demandas \\u2014 ${data}*`,\n  '',\n  `\\uD83C\\uDD95 Novas (24h): ${c.novas_24h ?? 0} \\u00b7 \\u23F3 Pendentes: ${c.pendentes ?? 0} \\u00b7 \\uD83D\\uDD27 Em andamento: ${c.em_andamento ?? 0} \\u00b7 \\uD83D\\uDEA8 Paradas 3+ dias: ${c.paradas_3d ?? 0}`,\n  ...lista(pend, 'Pendentes'),\n  ...lista(and, 'Em andamento'),\n].join('\\n');\nreturn [{ json: { texto, grupo_jid: $json.grupo_interno_jid, server_url: $json.server_url, instance: $json.instance } }];"
      },
      "id": "gmfc2-msg",
      "name": "Montar Resumo",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [1100, 220]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "={{ $json.server_url }}/message/sendText/{{ $json.instance }}",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendBody": true,
        "bodyParameters": {
          "parameters": [
            { "name": "number", "value": "={{ $json.grupo_jid }}" },
            { "name": "text", "value": "={{ $json.texto }}" }
          ]
        },
        "options": {}
      },
      "id": "gmfc2-evo",
      "name": "(EVO) Enviar Resumo",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [1320, 220],
      "credentials": {
        "httpHeaderAuth": { "id": "CRED_EVOLUTION_HEADER", "name": "CRED_EVOLUTION_HEADER" }
      }
    },
    {
      "parameters": {},
      "id": "gmfc2-noop",
      "name": "Equipe Sem Grupo (log)",
      "type": "n8n-nodes-base.noOp",
      "typeVersion": 1,
      "position": [1100, 420]
    }
  ],
  "connections": {
    "Agenda (seg–sex 08:30)": { "main": [[{ "node": "Buscar Resumo (BFF)", "type": "main", "index": 0 }]] },
    "Buscar Resumo (BFF)": { "main": [[{ "node": "Separar Equipes", "type": "main", "index": 0 }]] },
    "Separar Equipes": { "main": [[{ "node": "Buscar Grupo Interno", "type": "main", "index": 0 }]] },
    "Buscar Grupo Interno": { "main": [[{ "node": "Tem Grupo Interno?", "type": "main", "index": 0 }]] },
    "Tem Grupo Interno?": {
      "main": [
        [{ "node": "Montar Resumo", "type": "main", "index": 0 }],
        [{ "node": "Equipe Sem Grupo (log)", "type": "main", "index": 0 }]
      ]
    },
    "Montar Resumo": { "main": [[{ "node": "(EVO) Enviar Resumo", "type": "main", "index": 0 }]] }
  },
  "settings": { "executionOrder": "v1", "timezone": "America/Sao_Paulo" }
}
```

- [ ] **Step 2: Validar o JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('C:/Users/rick_/Downloads/gestmiles-agente-whatsapp/workflow-resumo-demandas.json','utf8')); console.log('JSON ok')"`
Expected: `JSON ok`

- [ ] **Step 3: Versionar na pasta do agente** (mesmo padrão, mensagem `feat: fase C — workflow gm-resumo-demandas`)

---

### Task 7: Script de import da Fase C (pasta do agente, importa INATIVO)

**Files:**
- Create: `C:\Users\rick_\Downloads\gestmiles-agente-whatsapp\scripts\import-workflow-fase-c.mjs`

**Interfaces:**
- Consumes: JSONs das Tasks 5 e 6.
- Produces: workflows criados no n8n **sem ativar** (diferente do `import-workflow-n8n.mjs`, que ativa). Envs: `N8N_URL`, `N8N_API_KEY`, `CRED_POSTGRES_ID`, `CRED_EVOLUTION_ID`, `CRED_WEBHOOK_DEMANDA_ID`, `CRED_RESUMO_APIKEY_ID`, `BFF_BASE_URL`.

- [ ] **Step 1: Criar o script**

```js
#!/usr/bin/env node
// Importa os workflows da Fase C no n8n via API pública, SEM ativar
// (ativação é passo manual do rollout, depois do teste com payload real).
// Injeta IDs reais de credenciais e a URL do BFF nos placeholders.
//
// Uso (PowerShell):
//   $env:N8N_URL="https://n8n.gestmiles.com.br"; $env:N8N_API_KEY="...";
//   $env:CRED_POSTGRES_ID="..."; $env:CRED_EVOLUTION_ID="...";
//   $env:CRED_WEBHOOK_DEMANDA_ID="..."; $env:CRED_RESUMO_APIKEY_ID="...";
//   $env:BFF_BASE_URL="https://SEU-BACKEND.vercel.app";
//   node scripts/import-workflow-fase-c.mjs workflow-notificar-demanda.json
//   node scripts/import-workflow-fase-c.mjs workflow-resumo-demandas.json

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const required = [
  'N8N_URL', 'N8N_API_KEY',
  'CRED_POSTGRES_ID', 'CRED_EVOLUTION_ID',
  'CRED_WEBHOOK_DEMANDA_ID', 'CRED_RESUMO_APIKEY_ID', 'BFF_BASE_URL',
];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Env vars faltando: ${missing.join(', ')}`);
  process.exit(1);
}
if (!process.argv[2]) {
  console.error('Uso: node scripts/import-workflow-fase-c.mjs <workflow.json>');
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = resolve(root, process.argv[2]);

let raw = readFileSync(file, 'utf8');
raw = raw
  .replaceAll('"id": "CRED_POSTGRES_AGENTE"', `"id": "${process.env.CRED_POSTGRES_ID}"`)
  .replaceAll('"id": "CRED_EVOLUTION_HEADER"', `"id": "${process.env.CRED_EVOLUTION_ID}"`)
  .replaceAll('"id": "CRED_WEBHOOK_DEMANDA"', `"id": "${process.env.CRED_WEBHOOK_DEMANDA_ID}"`)
  .replaceAll('"id": "CRED_RESUMO_APIKEY"', `"id": "${process.env.CRED_RESUMO_APIKEY_ID}"`)
  .replaceAll('BFF_BASE_URL', process.env.BFF_BASE_URL.replace(/\/$/, ''));

const wf = JSON.parse(raw);
const body = {
  name: wf.name,
  nodes: wf.nodes,
  connections: wf.connections,
  settings: wf.settings ?? {},
};

const base = process.env.N8N_URL.replace(/\/$/, '');
const res = await fetch(`${base}/api/v1/workflows`, {
  method: 'POST',
  headers: { 'X-N8N-API-KEY': process.env.N8N_API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const created = await res.json();
if (!res.ok) {
  console.error(`CREATE FALHOU ${res.status}: ${JSON.stringify(created).slice(0, 500)}`);
  process.exit(1);
}
console.log(`Criado (INATIVO): ${created.id} | ${created.name} | nodes=${created.nodes?.length}`);
console.log('Ative manualmente no n8n depois de testar com execução manual/payload de teste.');
```

- [ ] **Step 2: Smoke sintático**

Run: `node --check "C:/Users/rick_/Downloads/gestmiles-agente-whatsapp/scripts/import-workflow-fase-c.mjs"`
Expected: sem output (sintaxe ok)

- [ ] **Step 3: Versionar na pasta do agente** (mensagem `feat: fase C — script de import (sem ativar)`)

---

### Task 8: Docs da Fase C na pasta do agente + verificação total + PR (este repo)

**Files:**
- Modify: `C:\Users\rick_\Downloads\gestmiles-agente-whatsapp\README.md` (tabela de arquivos + etapa nova) e `docs\decisoes.md` (marcar Fase C como construída, apontando pros 2 workflows)
- Modify (este repo): `backend/docs/api.md` (documentar `GET /api/agent/demandas-resumo`)

- [ ] **Step 1: Atualizar docs do agente** — em `README.md`, adicionar linhas na tabela de arquivos (`workflow-notificar-demanda.json`, `workflow-resumo-demandas.json`, `sql/fase-c-grupo-interno.sql`, `scripts/import-workflow-fase-c.mjs`) e etapa `10. Fase C — notificação de demanda do app + resumo diário | done (aguardando rollout)`. Em `docs/decisoes.md`, na seção "Fase C", trocar "Não construído aqui — apenas registrado." por "Construída em 2026-07: `workflow-notificar-demanda.json` (webhook do GestMiles) + `workflow-resumo-demandas.json` (cron seg–sex 08:30). Fonte de leitura: rota `/api/agent/demandas-resumo` do BFF do app do usuário (migrável pra agent-api real trocando a URL)."

- [ ] **Step 2: Documentar a rota no contrato do BFF** — append em `backend/docs/api.md` seguindo o formato das rotas existentes: método/path, auth `x-api-key` (`AGENT_API_KEY`), resposta 200 com exemplo do JSON `{ gerado_em, equipes }`, erros 401/503.

- [ ] **Step 3: Verificação completa (este repo)**

```bash
npx tsc -b            # esperado: sem erros (nada de TS mudou, mas é o gate)
npm test              # esperado: suíte Vitest passa
cd backend && npm test && cd ..   # esperado: node --test passa (7 testes novos)
npm run build         # esperado: build Vite ok
```

- [ ] **Step 4: Commits finais + PR**

```bash
git add backend/docs/api.md
git commit -m "docs(backend): contrato da rota /api/agent/demandas-resumo

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push -u origin feat/notificacoes-whatsapp-demandas
gh pr create --title "feat: notificações WhatsApp de demandas (Fase C do agente)" --body "$(cat <<'EOF'
## Resumo
- Migration (NÃO aplicada): RPC cliente_criar_demanda carimba origem_registro='app_cliente' + trigger AFTER INSERT envia webhook pro n8n via pg_net (URL/secret no Vault; best-effort, nunca derruba a criação da demanda)
- Rota nova GET /api/agent/demandas-resumo (guard x-api-key, service role) pro resumo diário do n8n
- Workflows n8n (gm-notificar-demanda + gm-resumo-demandas) e SQL do banco do agente vivem na pasta gestmiles-agente-whatsapp (fora deste repo)
- Spec: docs/superpowers/specs/2026-07-09-notificacoes-whatsapp-demandas-design.md

## Rollout (após merge — ordem segura)
1. ALTER no banco do agente (grupo_interno_jid) + popular grupos internos
2. Credenciais n8n + importar workflows INATIVOS (script fase C)
3. Secrets no Vault do Supabase (SQL Editor, à mão)
4. Aplicar a migration (confirmação do owner — banco compartilhado)
5. Testar webhook manualmente → ativar gm-notificar-demanda → smoke com conta de teste
6. Configurar AGENT_API_KEY no Vercel do backend → ativar cron do resumo

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Rollout (fora do código — executar COM o owner, nessa ordem)

1. **Banco do agente:** rodar `sql/fase-c-grupo-interno.sql`; `update agent_tenants set grupo_interno_jid='...@g.us' where instance='...'` pros tenants ativos.
2. **n8n:** criar credenciais Header Auth `CRED_WEBHOOK_DEMANDA` (header `x-webhook-secret`, valor gerado com `openssl rand -hex 32`) e `CRED_RESUMO_APIKEY` (header `x-api-key`, valor = `AGENT_API_KEY`); importar os 2 workflows com `import-workflow-fase-c.mjs` (ficam inativos).
3. **Vault (SQL Editor do Supabase, à mão):**
   `select vault.create_secret('https://n8n.gestmiles.com.br/webhook/gm-demanda-registrada', 'n8n_demanda_webhook_url');`
   `select vault.create_secret('<mesmo secret da credencial CRED_WEBHOOK_DEMANDA>', 'n8n_demanda_webhook_secret');`
4. **Migration:** aplicar `20260709120000_demanda_app_notify_whatsapp.sql` via MCP/SQL Editor — **com confirmação explícita do owner na hora**. Rodar `get_advisors` depois.
5. **Teste:** executar `gm-notificar-demanda` em modo teste (Listen for test event) + criar demanda com a conta smoke (`smoke-usuario@gestmiles.com.br`) num grupo de teste; conferir `net._http_response` se nada chegar. Ativar o workflow.
6. **Backend:** `AGENT_API_KEY` no Vercel do backend (e `backend/.env` local); redeploy; testar `gm-resumo-demandas` com execução manual; ativar o cron.
7. Primeira manhã útil: conferir a mensagem real no grupo interno.
