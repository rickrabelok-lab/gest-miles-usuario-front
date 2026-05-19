# AP-20260519-041 Execution Report

- Executed at: 2026-05-19T10:55Z
- Scope approved: AP-041 only, isolated.
- Apply command: `supabase db query --linked --file artifacts/ap-041-perfis-helper-grants-hardening-apply_DRAFT_NOT_EXECUTED.sql`
- Precheck: target helpers had public=true, anon=true, authenticated=true, service_role=true.
- Postcheck: `can_view_perfil(uuid)`, `is_legacy_platform_admin()`, and `shares_reuniao_with(uuid)` now have public=false, anon=false, authenticated=true, service_role=true; SECURITY DEFINER and search_path=public preserved.
- Db lint: `supabase db lint --linked --schema public --level error --fail-on error` completed with no error rows.
- Not executed: db push geral, AP extras, commit, push, deploy, env/secrets, cleanup or rollback real.
