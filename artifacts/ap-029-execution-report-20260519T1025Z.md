# AP-20260519-029 Execution Report

- Executed at: 2026-05-19T10:25Z
- Scope approved/interpreted: AP-029 only, isolated.
- Apply command: `supabase db query --linked --file artifacts/ap-029-cs-provisionar-contract-forward-fix-apply_DRAFT_NOT_EXECUTED.sql`
- Pre-apply snapshot: `artifacts/ap-029-cs-provisionar-contract-forward-fix-preapply-snapshot-20260519T102428Z.md`
- Postcheck result: staff role guard, team scope guard, target role guard and no gestor_clientes reference all returned true.
- Grant posture: public=false, anon=false, authenticated=true.
- Db lint: `supabase db lint --linked --schema public --level error --fail-on error` completed with no error rows.
- Not executed: db push geral, migration repair, AP-030/AP-031/AP-032/AP-034..AP-045, commit, push, deploy, env/secrets, cleanup or rollback real.

Residual notes:
- This tightened the provisioning RPC contract. Any caller without staff role/team scope or targeting a non-cliente/non-cliente_gestao user now fails closed by design.
- Supabase CLI warned that v2.100.1 is available; current CLI is v2.98.2. No upgrade performed.
