# AP-20260519-033 Execution Report

- Executed at: 2026-05-19T10:25Z
- Scope approved/interpreted: AP-033 only, isolated.
- Apply command: `supabase db query --linked --file supabase/migrations/20260519024239_p1_db_lint_function_fixes.sql`
- Pre-apply snapshot: `artifacts/ap-033-db-lint-function-fixes-preapply-snapshot-20260519T101956Z.md`
- Targeted function check: all 4 functions returned `expected_body_patch_present=true`.
- Db lint: `supabase db lint --linked --schema public --level error --fail-on error` completed with no error rows.
- Not executed: db push geral, migration repair, commit, push, deploy, env/secrets, cleanup, rollback real, AP-029/AP-031/AP-032/AP-034..AP-045.

Residual notes:
- `_reconciliar_dupla_gestores` still has EXECUTE for public/anon/authenticated after AP-033; this was already outside AP-033 and belongs to later grants hardening APs.
- Supabase CLI warned that v2.100.1 is available; current CLI is v2.98.2. No upgrade performed.
