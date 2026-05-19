# AP-20260519-038 Execution Report

- Executed at: 2026-05-19T10:49Z
- Scope approved: corrected AP-038 only, isolated.
- Local correction before apply: removed stale `public.gestor_clientes` union from `supabase/migrations/20260530120000_dupla_scores_id_driven.sql`.
- Precheck: `20260530120000` local-only; `equipes_duplas` total=5, complete_pairs=5, incomplete_pairs=0; remote function was token-driven, used no `gestor_clientes`, authenticated execute=true.
- Snapshot: `artifacts/ap-038-preapply-snapshot-20260519T104816Z.md`.
- Apply command: `supabase db query --linked --file supabase/migrations/20260530120000_dupla_scores_id_driven.sql`.
- Postcheck: function now uses `dupla_defs` and `equipes_duplas`, does not use `dupla_tokens` or `gestor_clientes`, authenticated execute=true.
- Db lint: `supabase db lint --linked --schema public --level error --fail-on error` completed with no error rows.
- Not executed: migration repair, db push geral, commit, push, deploy, env/secrets, cleanup or rollback real.
