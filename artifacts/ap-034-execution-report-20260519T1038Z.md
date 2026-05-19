# AP-20260519-034 Execution Report

- Executed at: 2026-05-19T10:38Z
- Scope approved: AP-034 only, isolated.
- Command: `supabase migration repair --linked --status applied 20260429130000 20260429140000`
- Precheck: both IDs were local-only; policy `perfis_insert_provisao_equipe_cliente` existed with roles={authenticated}.
- Repair result: `Repaired migration history: [20260429130000 20260429140000] => applied`.
- Postcheck: both IDs now align Local/Remote; policy metadata unchanged.
- Db lint: `supabase db lint --linked --schema public --level error --fail-on error` completed with no error rows.
- Not executed: SQL apply, db push geral, AP extras, commit, push, deploy, env/secrets, cleanup or rollback real.
