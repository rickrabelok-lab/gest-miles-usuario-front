# AP-20260519-037 Execution Report

- Executed at: 2026-05-19T10:42Z
- Scope approved: AP-037 only, isolated.
- Command: `supabase migration repair --linked --status applied 20260430140000 20260430150000`
- Precheck: both IDs were local-only; remote had `perfis.cliente_status`, `vw_carteira_dupla`, and policy `contratos_cliente_select`.
- Repair result: `Repaired migration history: [20260430140000 20260430150000] => applied`.
- Postcheck: both IDs now align Local/Remote; metadata unchanged.
- Db lint: `supabase db lint --linked --schema public --level error --fail-on error` completed with no error rows.
- Not executed: SQL apply, db push geral, AP extras, commit, push, deploy, env/secrets, cleanup or rollback real.
