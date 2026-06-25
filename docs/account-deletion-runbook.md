# Runbook — Processar exclusão de conta (LGPD)

Quando uma solicitação em `conta_exclusao_solicitacoes` está `pendente` e
`agendado_para` já venceu, o owner processa o hard delete. Banco é prod
compartilhada, sem staging — confira o id antes de executar.

## Passos (service role / MCP)

1. Listar pendentes vencidas:
   `select usuario_id, email, agendado_para from conta_exclusao_solicitacoes
    where status='pendente' and agendado_para <= now();`
2. Conferir que é o usuário certo (id/email) e que não houve cancelamento.
3. Deletar o usuário no GoTrue (cascateia ~tudo: perfis, programas_cliente,
   demandas, timeline, nps/csat, alertas, lotes/movimentos, emissoes,
   notificacoes, credenciais cifradas, etc.):
   `auth.admin.deleteUser('<usuario_id>')` (service role; via dashboard Auth ou API admin).
4. Apagar PII órfã (sem FK pro usuário):
   - `delete from mensagens_contato where cliente_usuario_id = '<usuario_id>';`
   - `delete from indicacoes where indicador_usuario_id = '<usuario_id>';`
   - `delete from indicacao_codigos where usuario_id = '<usuario_id>';`
5. Anonimizar onde o usuário foi INDICADO (registro de outro indicador):
   `update indicacoes set indicado_usuario_id = null, indicado_email = null
    where indicado_usuario_id = '<usuario_id>';`
6. Marcar a solicitação concluída:
   `update conta_exclusao_solicitacoes set status='concluida', processado_em=now()
    where usuario_id = '<usuario_id>';`

## Notas
- Leftovers SET NULL (subscriptions/contratos_cliente/tarefas_cs/reunioes_onboarding/
  audit_logs) são mantidos com user nulado — aceitável (operacional/compliance).
- `auth.admin.deleteUser` exige service role — NUNCA no browser.
