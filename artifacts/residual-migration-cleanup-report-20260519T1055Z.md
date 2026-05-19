# Residual Migration Cleanup Report - 2026-05-19T10:55Z

## Executed

- Repaired history for SQL already applied manually and validated:
  - `20260428120000`
  - `20260519021126`
  - `20260519024239`
  - `20260530120000`
- Repaired canonical post-drop history after precheck confirmed runtime posture:
  - `20260430170000`
  - `20260430180000`

## Verification

- `supabase migration list --linked` confirms those IDs now align Local/Remote.
- `supabase db lint --linked --schema public --level error --fail-on error` passed with no error rows.
- Precheck for post-drop confirmed:
  - `public.gestor_clientes` absent
  - `can_manage_client`, `can_cs_view_client`, `list_clientes_sem_dupla`, `dupla_scores_refresh_snapshot` do not reference `gestor_clientes`

## Remaining local-only IDs

Still local-only and kept out of repair for now:

- `20260426120000`, `20260427120000`: prior HOLD for real policy divergences.
- `20260503120000`, `20260524120000`, duplicate `20260524120000`, `20260524140000`, `20260525120000`, `20260525140000`, `20260526120000`: old dupla_scores / gestor_clientes lineage superseded by AP-038; needs source-history cleanup, not blind repair.
- `20260504120000`: old provisioning function references `gestor_clientes`; superseded by AP-029.
- `20260522120000`: V1 superseded by repaired V2 `20260523120000`.
- `20260527120000`: stale list_clientes_sem_dupla references `gestor_clientes`; superseded by AP-032.

## Not executed

- No SQL apply, db push geral, commit, push, deploy, env/secrets, cleanup/delete or rollback real.
