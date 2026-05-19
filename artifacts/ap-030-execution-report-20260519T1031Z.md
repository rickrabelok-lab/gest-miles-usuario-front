# AP-20260519-030 Execution Report

- Executed at: 2026-05-19T10:31Z
- Scope approved/interpreted: AP-030 only, isolated.
- Command: `supabase migration repair --linked --status applied 20260523120000`
- Precheck: migration `20260523120000` was local-only; pg_proc confirmed `cs_sincronizar_equipe_clientes_nac_intl(uuid,uuid,uuid,uuid)` exists, SECURITY DEFINER, search_path=public, comment null.
- Repair result: `Repaired migration history: [20260523120000] => applied`.
- Postcheck: migration list now shows local and remote `20260523120000`; pg_proc metadata unchanged.
- Db lint: `supabase db lint --linked --schema public --level error --fail-on error` completed with no error rows.
- Not executed: SQL apply, db push geral, revoke/grant, rollback real, commit, push, deploy, env/secrets, AP-012, `20260527120000` or AP extras.

Residual notes:
- `20260527120000` remains HOLD/NO-GO for blind repair because local source references removed `public.gestor_clientes`.
- Supabase CLI warned that v2.100.1 is available; current CLI is v2.98.2. No upgrade performed.
