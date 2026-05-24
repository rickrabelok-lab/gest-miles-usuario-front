begin;

do $$
begin
  if to_regclass('public.perfis') is null then
    raise exception 'missing dependency: public.perfis';
  end if;
  if to_regclass('public.equipes') is null then
    raise exception 'missing dependency: public.equipes';
  end if;
  if to_regclass('public.equipe_gestores') is null then
    raise exception 'missing dependency: public.equipe_gestores';
  end if;
  if to_regclass('public.equipe_cs') is null then
    raise exception 'missing dependency: public.equipe_cs';
  end if;
  if to_regclass('public.equipe_gestor_slots') is null then
    raise exception 'missing dependency: public.equipe_gestor_slots';
  end if;
  if to_regclass('public.equipe_cs_slot_assignments') is null then
    raise exception 'missing dependency: public.equipe_cs_slot_assignments';
  end if;
end $$;

create or replace function public.admin_set_equipe_gestor_slots(
  p_equipe_id uuid,
  p_slots jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_actor_equipe_id uuid;
  v_payload jsonb := coalesce(p_slots, '[]'::jsonb);
  v_payload_count integer := 0;
  v_inserted_count integer := 0;
begin
  if v_actor is null then
    raise exception 'admin_set_equipe_gestor_slots_unauthenticated' using errcode = '42501';
  end if;

  if p_equipe_id is null or jsonb_typeof(v_payload) <> 'array' then
    raise exception 'admin_set_equipe_gestor_slots_invalid_input' using errcode = '23514';
  end if;

  select lower(trim(coalesce(p.role::text, ''))), p.equipe_id
    into v_actor_role, v_actor_equipe_id
  from public.perfis p
  where p.usuario_id = v_actor;

  if v_actor_role is null or v_actor_role not in ('admin_master', 'admin', 'admin_equipe') then
    raise exception 'admin_set_equipe_gestor_slots_forbidden' using errcode = '42501';
  end if;

  if (v_actor_role = 'admin_equipe' or (v_actor_role = 'admin' and v_actor_equipe_id is not null))
     and (v_actor_equipe_id is null or p_equipe_id is distinct from v_actor_equipe_id) then
    raise exception 'admin_set_equipe_gestor_slots_cross_team_forbidden' using errcode = '42501';
  end if;

  perform 1
  from public.equipes e
  where e.id = p_equipe_id
  for update;

  if not found then
    raise exception 'admin_set_equipe_gestor_slots_equipe_not_found' using errcode = '23503';
  end if;

  v_payload_count := jsonb_array_length(v_payload);

  if exists (
    select 1
    from jsonb_array_elements(v_payload) as item(value)
    where jsonb_typeof(item.value) <> 'object'
       or coalesce(item.value->>'gestor_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or coalesce(item.value->>'slot', '') !~ '^[0-9]+$'
       or (item.value->>'slot')::integer <= 0
  ) then
    raise exception 'admin_set_equipe_gestor_slots_invalid_payload' using errcode = '23514';
  end if;

  if (
    select count(distinct item.value->>'gestor_id')
    from jsonb_array_elements(v_payload) as item(value)
  ) <> v_payload_count then
    raise exception 'admin_set_equipe_gestor_slots_duplicate_gestor' using errcode = '23505';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_payload) as item(value)
    left join public.perfis gestor
      on gestor.usuario_id = (item.value->>'gestor_id')::uuid
    left join public.equipe_gestores eg
      on eg.equipe_id = p_equipe_id
     and eg.gestor_id = (item.value->>'gestor_id')::uuid
    where gestor.usuario_id is null
       or lower(trim(coalesce(gestor.role::text, ''))) <> 'gestor'
       or (gestor.equipe_id is distinct from p_equipe_id and eg.gestor_id is null)
  ) then
    raise exception 'admin_set_equipe_gestor_slots_invalid_gestor' using errcode = '23514';
  end if;

  delete from public.equipe_gestor_slots
  where equipe_id = p_equipe_id;

  insert into public.equipe_gestor_slots(equipe_id, gestor_id, slot, updated_at)
  select
    p_equipe_id,
    (item.value->>'gestor_id')::uuid,
    (item.value->>'slot')::integer,
    now()
  from jsonb_array_elements(v_payload) as item(value);
  get diagnostics v_inserted_count = row_count;

  if to_regclass('public.logs_acoes') is not null then
    insert into public.logs_acoes(user_id, tipo_acao, entidade_afetada, entidade_id, details)
    values (
      v_actor,
      'admin_team_slots.set_gestor_slots',
      'equipe_gestor_slots',
      p_equipe_id::text,
      jsonb_build_object('slot_count', v_inserted_count)
    );
  end if;

  return jsonb_build_object('ok', true, 'equipe_id', p_equipe_id, 'slot_count', v_inserted_count);
end;
$$;

create or replace function public.admin_set_equipe_cs_slot_assignments(
  p_equipe_id uuid,
  p_assignments jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_actor_equipe_id uuid;
  v_payload jsonb := coalesce(p_assignments, '[]'::jsonb);
  v_payload_count integer := 0;
  v_inserted_count integer := 0;
begin
  if v_actor is null then
    raise exception 'admin_set_equipe_cs_slot_assignments_unauthenticated' using errcode = '42501';
  end if;

  if p_equipe_id is null or jsonb_typeof(v_payload) <> 'array' then
    raise exception 'admin_set_equipe_cs_slot_assignments_invalid_input' using errcode = '23514';
  end if;

  select lower(trim(coalesce(p.role::text, ''))), p.equipe_id
    into v_actor_role, v_actor_equipe_id
  from public.perfis p
  where p.usuario_id = v_actor;

  if v_actor_role is null or v_actor_role not in ('admin_master', 'admin', 'admin_equipe') then
    raise exception 'admin_set_equipe_cs_slot_assignments_forbidden' using errcode = '42501';
  end if;

  if (v_actor_role = 'admin_equipe' or (v_actor_role = 'admin' and v_actor_equipe_id is not null))
     and (v_actor_equipe_id is null or p_equipe_id is distinct from v_actor_equipe_id) then
    raise exception 'admin_set_equipe_cs_slot_assignments_cross_team_forbidden' using errcode = '42501';
  end if;

  perform 1
  from public.equipes e
  where e.id = p_equipe_id
  for update;

  if not found then
    raise exception 'admin_set_equipe_cs_slot_assignments_equipe_not_found' using errcode = '23503';
  end if;

  v_payload_count := jsonb_array_length(v_payload);

  if exists (
    select 1
    from jsonb_array_elements(v_payload) as item(value)
    where jsonb_typeof(item.value) <> 'object'
       or coalesce(item.value->>'cs_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or coalesce(item.value->>'slot', '') !~ '^[0-9]+$'
       or (item.value->>'slot')::integer <= 0
  ) then
    raise exception 'admin_set_equipe_cs_slot_assignments_invalid_payload' using errcode = '23514';
  end if;

  if (
    select count(*)
    from (
      select distinct item.value->>'slot', item.value->>'cs_id'
      from jsonb_array_elements(v_payload) as item(value)
    ) d
  ) <> v_payload_count then
    raise exception 'admin_set_equipe_cs_slot_assignments_duplicate_assignment' using errcode = '23505';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_payload) as item(value)
    left join public.perfis cs
      on cs.usuario_id = (item.value->>'cs_id')::uuid
    left join public.equipe_cs ec
      on ec.equipe_id = p_equipe_id
     and ec.cs_id = (item.value->>'cs_id')::uuid
    where cs.usuario_id is null
       or lower(trim(coalesce(cs.role::text, ''))) <> 'cs'
       or (cs.equipe_id is distinct from p_equipe_id and ec.cs_id is null)
  ) then
    raise exception 'admin_set_equipe_cs_slot_assignments_invalid_cs' using errcode = '23514';
  end if;

  delete from public.equipe_cs_slot_assignments
  where equipe_id = p_equipe_id;

  insert into public.equipe_cs_slot_assignments(equipe_id, slot, cs_id, updated_at)
  select
    p_equipe_id,
    (item.value->>'slot')::integer,
    (item.value->>'cs_id')::uuid,
    now()
  from jsonb_array_elements(v_payload) as item(value);
  get diagnostics v_inserted_count = row_count;

  if to_regclass('public.logs_acoes') is not null then
    insert into public.logs_acoes(user_id, tipo_acao, entidade_afetada, entidade_id, details)
    values (
      v_actor,
      'admin_team_slots.set_cs_slot_assignments',
      'equipe_cs_slot_assignments',
      p_equipe_id::text,
      jsonb_build_object('assignment_count', v_inserted_count)
    );
  end if;

  return jsonb_build_object('ok', true, 'equipe_id', p_equipe_id, 'assignment_count', v_inserted_count);
end;
$$;

revoke insert, update, delete on table public.equipe_gestor_slots from authenticated;
revoke insert, update, delete on table public.equipe_cs_slot_assignments from authenticated;
grant select on table public.equipe_gestor_slots to authenticated;
grant select on table public.equipe_cs_slot_assignments to authenticated;
grant all on table public.equipe_gestor_slots to service_role;
grant all on table public.equipe_cs_slot_assignments to service_role;

revoke all on function public.admin_set_equipe_gestor_slots(uuid, jsonb) from public, anon;
grant execute on function public.admin_set_equipe_gestor_slots(uuid, jsonb) to authenticated, service_role;

revoke all on function public.admin_set_equipe_cs_slot_assignments(uuid, jsonb) from public, anon;
grant execute on function public.admin_set_equipe_cs_slot_assignments(uuid, jsonb) to authenticated, service_role;

commit;
