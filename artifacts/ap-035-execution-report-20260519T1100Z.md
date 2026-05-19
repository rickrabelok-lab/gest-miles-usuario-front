# AP-20260519-035 Execution Report

- Executed at: 2026-05-19T11:00Z
- Scope approved: AP-035 only, isolated.
- Apply command: `supabase db query --linked --file supabase/migrations/20260428120000_logs_acoes_select_admin_equipe_expand.sql`
- Precheck: `logs_acoes_select_admin_equipe` was absent; existing self/admin policies present.
- Postcheck: `logs_acoes_select_admin_equipe` exists as SELECT policy alongside existing policies.
- Db lint: `supabase db lint --linked --schema public --level error --fail-on error` completed with no error rows.
- Not executed: migration repair, db push geral, AP extras, commit, push, deploy, env/secrets, cleanup or rollback real.
