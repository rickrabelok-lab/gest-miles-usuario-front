revoke execute on function public.agendar_reuniao_com_participantes(text, text, timestamptz, uuid, uuid, uuid, text, uuid[]) from public, anon, authenticated;
revoke execute on function public.audit_log_write(uuid, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.confirmar_renovacao_contrato(uuid) from public, anon, authenticated;
revoke execute on function public.notificacoes_push(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.processar_expiracao_contratos_diaria() from public, anon, authenticated;
revoke execute on function public.salvar_perfil_cliente_atomico(uuid, text, jsonb, text, uuid, uuid, uuid, uuid[]) from public, anon, authenticated;

revoke execute on function public.configuracoes_log_historico() from public, anon, authenticated;
revoke execute on function public.nps_after_avaliacao_consume_convites() from public, anon, authenticated;
revoke execute on function public.nps_after_emissao_insert() from public, anon, authenticated;
revoke execute on function public.sync_cliente_gestao_para_equipe_clientes() from public, anon, authenticated;
revoke execute on function public.sync_perfis_configuracao_from_perfis() from public, anon, authenticated;
