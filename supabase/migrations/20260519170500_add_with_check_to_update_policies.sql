alter policy alertas_dismissals_own
  on public.alertas_dismissals
  with check (usuario_id = auth.uid());

alter policy "tenant owns config"
  on public.calculator_configs
  with check (tenant_id = auth.uid());

alter policy captacao_custom_domains_update
  on public.captacao_custom_domains
  with check (
    can_admin_equipe(equipe_id)
    or equipe_usuario_eh_admin(equipe_id, auth.uid())
  );

alter policy captacao_hero_update
  on public.captacao_hero_metrics
  with check (
    is_legacy_platform_admin()
    or can_admin_equipe(equipe_id)
    or equipe_usuario_eh_admin(equipe_id, auth.uid())
  );

alter policy captacao_leads_update
  on public.captacao_leads
  with check (
    is_legacy_platform_admin()
    or can_admin_equipe(equipe_id)
    or equipe_usuario_eh_admin(equipe_id, auth.uid())
    or is_closer_da_equipe(equipe_id)
  );

alter policy captacao_tracking_configs_admin_update
  on public.captacao_tracking_configs
  with check (equipe_usuario_eh_admin(equipe_id, auth.uid()));
