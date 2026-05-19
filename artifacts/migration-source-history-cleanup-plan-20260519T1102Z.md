# Source-History Cleanup Plan - 2026-05-19T11:02Z

## Goal

Reduce future migration confusion after the approved production fixes without deleting, moving, or rewriting historical migration files in this pass.

## Current truth

Production/runtime is already aligned on the new posture:

- `public.gestor_clientes` is absent.
- `cs_provisionar_cliente_gestao_completo` is fixed by AP-029.
- `list_clientes_sem_dupla` is superseded by AP-032.
- `dupla_scores_refresh_snapshot` is fixed by AP-038.
- `supabase db lint --linked --schema public --level error --fail-on error` passes.
- Front gates pass:
  - usuario: `npm run lint`, `npm run build`
  - admin: `npm run lint`, `npm run build`, `npm run check:boundaries`

## Remaining local-only migrations and classification

### Keep as HOLD, do not repair blindly

- `20260426120000_admin_equipe_acesso_total.sql`
- `20260427120000_admin_equipe_full_rls_fix.sql`

Reason: prior read-only classification found real policy divergences in runtime. These need a dedicated semantic diff, not repair.

### Superseded by canonical post-drop and AP-038

- `20260503120000_dupla_scores.sql`
- `20260524120000_fix_dupla_scores_gestor_tokens.sql`
- `20260525120000_dupla_scores_vincula_cliente_gestao_contratos.sql`
- `20260525140000_dupla_scores_carteira_gestor_clientes_equipe.sql`
- `20260526120000_dupla_scores_inclui_role_gestor.sql`

Reason: these are older dupla_scores bodies. Several still reference `public.gestor_clientes`. Runtime is now AP-038 id-driven via `public.equipes_duplas`.

### Legacy table migrations, do not apply

- `20260524120000_gestor_clientes_unique_cliente_gestor.sql`
- `20260524140000_gestor_clientes_rls_staff_operacional.sql`

Reason: they target `public.gestor_clientes`, which is intentionally removed.

### Superseded RPC/function bodies

- `20260504120000_cs_provisionar_cliente_gestao_completo_rpc.sql`
  - Superseded by AP-029.
  - Still references `public.gestor_clientes`.
- `20260522120000_cs_sincronizar_equipe_clientes_nac_intl.sql`
  - Superseded by repaired V2 `20260523120000`.
- `20260527120000_list_clientes_sem_dupla.sql`
  - Superseded by AP-032.
  - Still references `public.gestor_clientes`.

## Recommended cleanup path

### Phase 1, safe now

Create a local documentation manifest listing these migrations as superseded/HOLD. No file deletion, no move, no git operations.

Suggested file:

- `gest-miles-usuario-front/artifacts/migration-source-history-cleanup-manifest-20260519.md`

### Phase 2, after explicit commit approval

One of these two options:

1. Conservative: keep historical migrations untouched and commit only the manifest + new AP migration files.
2. Cleaner but more invasive: move superseded local-only migrations into an archive folder outside `supabase/migrations`, then run `supabase migration list --linked` to confirm local-only noise drops. This is a file move and needs explicit approval.

Recommendation: use option 1 for now. It preserves history and avoids a large filesystem churn before release.

## Not executed

No delete, move, commit, push, deploy, db push, env/secrets, rollback real or production mutation in this cleanup planning pass.
