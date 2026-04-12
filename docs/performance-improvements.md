# Performance Improvements — Gest Miles

> Última atualização: 2026-04-12 (Prompt 4)

## 1. Índices Compostos Criados

| Índice | Tabela | Colunas | Justificação |
|--------|--------|---------|--------------|
| `idx_demandas_cliente_cliente_status_created` | `demandas_cliente` | `(cliente_id, status, created_at DESC)` | Listagens filtradas por cliente + estado + cronologia (dashboard gestor/CS) |
| `idx_perfis_equipe_role` | `perfis` | `(equipe_id, role)` | Lookups `WHERE equipe_id = ? AND role = ?` (ex.: listar gestores de uma equipa) |
| `idx_emissoes_cliente_data` | `emissoes` | `(cliente_id, data_emissao DESC)` | Listagem de emissões por cliente ordenadas por data |
| `idx_logs_acoes_user_timestamp` | `logs_acoes` | `(user_id, timestamp DESC)` | Listagem de logs por utilizador + cronologia |

### Índices existentes (antes do Prompt 4)

Já estavam criados 60+ índices cobrindo as tabelas principais. A lista completa pode ser consultada no `pg_indexes` do banco ou na sequência de ficheiros em `supabase/migrations/`.

Destaques:
- `audit_logs`: 4 índices (equipe+created, user+created, tabela, created DESC)
- `nps_avaliacoes` / `csat_avaliacoes`: 6 índices cada (gestor, cliente, equipe, data, classificação)
- `alertas_sistema` / `tarefas_cs` / `insights_cliente`: índices compostos + parciais (dedup)
- `notificacoes`: composto `(usuario_id, lida, data_criacao DESC)` + dedup único

## 2. Índices Redundantes Removidos

| Índice removido | Coberto por | Motivo |
|-----------------|-------------|--------|
| `idx_audit_logs_equipe_id` | `idx_audit_logs_equipe_created` | Prefixo do composto (equipe_id, created_at DESC) |
| `idx_audit_logs_user_id` | `idx_audit_logs_user_created` | Prefixo do composto (user_id, created_at DESC) |
| `idx_nps_convites_cliente` | `idx_nps_convites_pending` | Prefixo do composto parcial (cliente_id, gestor_id) |

**Impacto:** Reduz overhead de escrita em 3 índices sem perder cobertura de leitura.

## 3. Eliminação de N+1

### `useCsVincularClienteNaEquipe` / `useCsVincularClienteMulti`

**Antes:** Loop `for...of` com um `INSERT` por gestor (N round-trips).

```typescript
// ANTES — N round-trips
for (const gestor_id of gestorIds) {
  await supabase.from("cliente_gestores").insert({ cliente_id, gestor_id });
}
```

**Depois:** Batch `upsert` com `ignoreDuplicates: true` (1 round-trip).

```typescript
// DEPOIS — 1 round-trip
const rows = gestorIds.map((gestor_id) => ({ cliente_id, gestor_id }));
const { data, error } = await supabase
  .from("cliente_gestores")
  .upsert(rows, { onConflict: "cliente_id,gestor_id", ignoreDuplicates: true })
  .select();
```

**Ficheiros corrigidos:**
- `gest-miles-usuario-front/src/hooks/useCsVincularCliente.ts`
- `gest-miles-manager-front/apps/manager/src/hooks/useCsVincularCliente.ts`

### Outras cadeias sequenciais identificadas (não N+1 clássico)

| Ficheiro | Padrão | Risco | Acção recomendada |
|----------|--------|-------|-------------------|
| `useMinhasReunioes.ts` | 4 queries sequenciais (participantes → reuniões → equipes → perfis) | Latência em série | Considerar view ou RPC no backend |
| `useCsGestores.ts` | Pipeline longo (7+ etapas) | Latência cumulativa | Já usa `Promise.all` para paralelizar ramos independentes; aceitável |
| `DashboardHeader.tsx` | `cliente_gestores` → `perfis.in(ids)` | 2 queries fixas | Aceitável; não escala com N |

## 4. RLS — Correcções de Isolamento por Tenant

### Gap CRÍTICO: `organizacoes_cliente`

Tabela criada **sem** `ENABLE ROW LEVEL SECURITY` — dados potencialmente acessíveis cross-tenant via PostgREST.

**Correcção aplicada (migration `20260416140000`):**
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
- Política `SELECT`: legacy admin, creator, team admin do creator, ou membro da organização
- Política `INSERT`: legacy admin ou creator
- Política `UPDATE`: legacy admin ou creator
- Política `DELETE`: legacy admin apenas

### Gap: `insights_cliente` — team admin invisível

Team admins não conseguiam ver insights da sua equipa (faltava `rls_team_admin_matches_equipe`).

**Correcção aplicada:**
- `SELECT` e `UPDATE`: adicionado `OR (equipe_id IS NOT NULL AND rls_team_admin_matches_equipe(equipe_id))`

### Safety net: `perfis` — ENABLE RLS

`ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY` adicionado (idempotente, não altera se já estiver activo).

## 5. Migration Aplicada

```
supabase/migrations/20260416140000_rls_hardening_indexes.sql
```

Contém todas as alterações acima numa única migration incremental.
