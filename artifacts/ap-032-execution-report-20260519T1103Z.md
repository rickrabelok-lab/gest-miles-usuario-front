# AP-20260519-032 Execution Report

- Executed at: 2026-05-19T11:03Z
- Scope approved: AP-032 only, isolated.
- Apply command: `supabase db query --linked --file supabase/migrations/20260519021126_supersede_list_clientes_sem_dupla_post_drop.sql`
- Precheck: function already had no `public.gestor_clientes` reference; comment was null.
- Postcheck: function still has no `public.gestor_clientes`, references `cliente_gestores` and `equipe_clientes`, grants public=false, anon=false, authenticated=true, and explicit supersede comment exists.
- Db lint: `supabase db lint --linked --schema public --level error --fail-on error` completed with no error rows.
- Not executed: repair of `20260527120000`, db push geral, AP extras, commit, push, deploy, env/secrets, cleanup or rollback real.
