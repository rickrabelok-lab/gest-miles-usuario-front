begin;

do $$
begin
  if to_regclass('public.captacao_leads') is null then
    raise exception 'missing_table_public_captacao_leads';
  end if;
end;
$$;

create or replace function public.manager_captacao_lead_can_update(p_equipe_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    public.is_legacy_platform_admin()
    or public.can_admin_equipe(p_equipe_id)
    or public.equipe_usuario_eh_admin(p_equipe_id, auth.uid())
    or public.is_closer_da_equipe(p_equipe_id),
    false
  );
$$;

create or replace function public.manager_captacao_lead_can_manage(p_equipe_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    public.is_legacy_platform_admin()
    or public.can_admin_equipe(p_equipe_id)
    or public.equipe_usuario_eh_admin(p_equipe_id, auth.uid()),
    false
  );
$$;

create or replace function public.manager_captacao_lead_update_pipeline(
  p_lead_id uuid,
  p_pipeline_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_equipe_id uuid;
  v_status text := nullif(trim(p_pipeline_status), '');
begin
  if v_actor is null then
    raise exception 'manager_captacao_lead_unauthenticated' using errcode = '42501';
  end if;

  if v_status is null or v_status not in ('pendente', 'em_andamento', 'parcialmente_concluida', 'concluida', 'reprovado') then
    raise exception 'manager_captacao_lead_invalid_pipeline_status' using errcode = '23514';
  end if;

  select equipe_id into v_equipe_id
  from public.captacao_leads
  where id = p_lead_id;

  if v_equipe_id is null then
    raise exception 'manager_captacao_lead_not_found' using errcode = 'P0002';
  end if;

  if not public.manager_captacao_lead_can_update(v_equipe_id) then
    raise exception 'manager_captacao_lead_forbidden' using errcode = '42501';
  end if;

  update public.captacao_leads
  set pipeline_status = v_status
  where id = p_lead_id;

  return jsonb_build_object('ok', true, 'id', p_lead_id, 'pipeline_status', v_status);
end;
$$;

create or replace function public.manager_captacao_lead_delete(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_equipe_id uuid;
begin
  if v_actor is null then
    raise exception 'manager_captacao_lead_unauthenticated' using errcode = '42501';
  end if;

  select equipe_id into v_equipe_id
  from public.captacao_leads
  where id = p_lead_id;

  if v_equipe_id is null then
    raise exception 'manager_captacao_lead_not_found' using errcode = 'P0002';
  end if;

  if not public.manager_captacao_lead_can_manage(v_equipe_id) then
    raise exception 'manager_captacao_lead_forbidden' using errcode = '42501';
  end if;

  delete from public.captacao_leads
  where id = p_lead_id;

  return jsonb_build_object('ok', true, 'id', p_lead_id);
end;
$$;

create or replace function public.manager_captacao_lead_create_manual(
  p_equipe_id uuid,
  p_slug text,
  p_nome text,
  p_email text default '',
  p_telefone text default '',
  p_observacoes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_slug text := nullif(trim(p_slug), '');
  v_nome text := nullif(trim(p_nome), '');
  v_email text := coalesce(trim(p_email), '');
  v_telefone text := coalesce(trim(p_telefone), '');
  v_observacoes text := coalesce(nullif(trim(p_observacoes), ''), 'Lead criado manualmente no kanban');
  v_resolved_equipe_id uuid;
  v_id uuid;
begin
  if v_actor is null then
    raise exception 'manager_captacao_lead_unauthenticated' using errcode = '42501';
  end if;

  if p_equipe_id is null then
    raise exception 'manager_captacao_lead_missing_equipe' using errcode = '23502';
  end if;

  if not public.manager_captacao_lead_can_manage(p_equipe_id) then
    raise exception 'manager_captacao_lead_forbidden' using errcode = '42501';
  end if;

  if v_slug is null then
    raise exception 'manager_captacao_lead_missing_slug' using errcode = '23514';
  end if;

  if v_nome is null then
    raise exception 'manager_captacao_lead_missing_nome' using errcode = '23514';
  end if;

  v_resolved_equipe_id := public.resolver_equipe_por_captacao_slug(v_slug);
  if v_resolved_equipe_id is distinct from p_equipe_id then
    raise exception 'manager_captacao_lead_slug_equipe_mismatch' using errcode = '42501';
  end if;

  insert into public.captacao_leads(
    equipe_id,
    slug,
    nome,
    email,
    telefone,
    observacoes,
    canal,
    pipeline_status
  )
  values (
    p_equipe_id,
    v_slug,
    v_nome,
    v_email,
    v_telefone,
    v_observacoes,
    'manual',
    'pendente'
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.manager_captacao_lead_can_update(uuid) from public, anon;
revoke all on function public.manager_captacao_lead_can_update(uuid) from authenticated, service_role;
revoke all on function public.manager_captacao_lead_can_manage(uuid) from public, anon;
revoke all on function public.manager_captacao_lead_can_manage(uuid) from authenticated, service_role;
revoke all on function public.manager_captacao_lead_update_pipeline(uuid, text) from public, anon;
revoke all on function public.manager_captacao_lead_delete(uuid) from public, anon;
revoke all on function public.manager_captacao_lead_create_manual(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.manager_captacao_lead_update_pipeline(uuid, text) to authenticated, service_role;
grant execute on function public.manager_captacao_lead_delete(uuid) to authenticated, service_role;
grant execute on function public.manager_captacao_lead_create_manual(uuid, text, text, text, text, text) to authenticated, service_role;

commit;
