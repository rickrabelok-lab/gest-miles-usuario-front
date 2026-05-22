revoke execute on function public._reconciliar_dupla_gestores(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.refresh_cliente_status(uuid) from public, anon, authenticated;
revoke execute on function public.sync_cliente_gestores_para_dupla(uuid) from public, anon, authenticated;
revoke execute on function public.timeline_eventos_push(uuid, uuid, uuid, text, text, text, jsonb, timestamptz) from public, anon, authenticated;

revoke execute on function public.timeline_on_alerta_insert() from public, anon, authenticated;
revoke execute on function public.timeline_on_csat_insert() from public, anon, authenticated;
revoke execute on function public.timeline_on_emissao_insert() from public, anon, authenticated;
revoke execute on function public.timeline_on_nps_insert() from public, anon, authenticated;
revoke execute on function public.timeline_on_programa_saldo_update() from public, anon, authenticated;
revoke execute on function public.timeline_on_tarefa_insert() from public, anon, authenticated;
revoke execute on function public.timeline_on_tarefa_update() from public, anon, authenticated;

revoke execute on function public.trg_contratos_refresh_cliente_status() from public, anon, authenticated;
revoke execute on function public.trg_equipe_clientes_cleanup_dupla() from public, anon, authenticated;
revoke execute on function public.trg_equipe_clientes_fill_nomes() from public, anon, authenticated;
revoke execute on function public.trg_equipe_clientes_snapshot_admins_equipe() from public, anon, authenticated;
revoke execute on function public.trg_equipe_clientes_sync_dupla() from public, anon, authenticated;
revoke execute on function public.trg_equipe_cs_fill_cs_nome() from public, anon, authenticated;
revoke execute on function public.trg_equipe_cs_fill_denorm_nomes() from public, anon, authenticated;
revoke execute on function public.trg_equipe_gestores_fill_denorm_nomes() from public, anon, authenticated;
revoke execute on function public.trg_equipe_gestores_fill_gestor_nome() from public, anon, authenticated;
revoke execute on function public.trg_equipes_ensure_equipe_admin_row() from public, anon, authenticated;
revoke execute on function public.trg_equipes_sync_nome_equipe_admin() from public, anon, authenticated;
revoke execute on function public.trg_perfis_ensure_equipe_cliente_gestao() from public, anon, authenticated;
revoke execute on function public.trg_perfis_nome_propaga_equipe_cs_gestores() from public, anon, authenticated;
revoke execute on function public.trg_perfis_propaga_nome_equipe_clientes() from public, anon, authenticated;
revoke execute on function public.trg_perfis_subscription_refresh_status() from public, anon, authenticated;
