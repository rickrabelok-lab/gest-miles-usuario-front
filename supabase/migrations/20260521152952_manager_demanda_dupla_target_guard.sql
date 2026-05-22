begin;

do $$
begin
  if to_regclass('public.demandas_cliente') is null then
    raise exception 'missing_table_public_demandas_cliente';
  end if;

  if to_regprocedure('public.can_manage_client(uuid)') is null then
    raise exception 'missing_function_public_can_manage_client';
  end if;
end;
$$;


create table if not exists public.equipes_duplas (
  id uuid primary key default gen_random_uuid(),
  equipe_id uuid not null references public.equipes (id) on delete cascade,
  ordem smallint not null default 1,
  nome text not null,
  gestor_nacional_id uuid not null references auth.users (id) on delete restrict,
  gestor_internacional_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (equipe_id, ordem),
  unique (equipe_id, gestor_nacional_id, gestor_internacional_id),
  check (gestor_nacional_id <> gestor_internacional_id)
);

create index if not exists equipes_duplas_equipe_id_idx
  on public.equipes_duplas (equipe_id);

alter table public.equipes_duplas enable row level security;

drop policy if exists equipes_duplas_select_authenticated on public.equipes_duplas;
create policy equipes_duplas_select_authenticated
  on public.equipes_duplas
  for select
  to authenticated
  using (true);

insert into public.equipes_duplas (equipe_id, ordem, nome, gestor_nacional_id, gestor_internacional_id)
select
  e.id,
  v.ordem,
  v.nome,
  nac.id,
  intl.id
from public.equipes e
cross join (values
  (1, 'Equipe 1 - Guilherme + Filipe', 'redacted@example.com', 'redacted@example.com'),
  (2, 'Equipe 2 - Tiago + Silmara', 'redacted@example.com', 'redacted@example.com'),
  (3, 'Equipe 3 - Rick + Jessica', 'redacted@example.com', 'redacted@example.com'),
  (4, 'Equipe 4 - Diogo + Ana', 'redacted@example.com', 'redacted@example.com'),
  (5, 'Equipe 5 - Wesley + Carla', 'redacted@example.com', 'redacted@example.com')
) as v(ordem, nome, email_nac, email_intl)
inner join auth.users nac on lower(nac.email) = lower(v.email_nac)
inner join auth.users intl on lower(intl.email) = lower(v.email_intl)
where e.nome = 'Equipe do João Carvalho'
  and not exists (
    select 1
    from public.equipes_duplas ed
    where ed.equipe_id = e.id
      and ed.gestor_nacional_id = nac.id
      and ed.gestor_internacional_id = intl.id
  );


create or replace function public.manager_demanda_target_gestor_allowed(
  p_cliente_id uuid,
  p_target_gestor_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p_target_gestor_id is null
    or exists (
      select 1
      from public.cliente_gestores cg
      where cg.cliente_id = p_cliente_id
        and cg.gestor_id = p_target_gestor_id
    )
    or exists (
      select 1
      from public.equipe_clientes ec
      where ec.cliente_id = p_cliente_id
        and ec.ativo = true
        and p_target_gestor_id in (ec.gestor_nacional_id, ec.gestor_internacional_id)
    )
    or exists (
      select 1
      from public.equipes_duplas ed
      where auth.uid() in (ed.gestor_nacional_id, ed.gestor_internacional_id)
        and p_target_gestor_id in (ed.gestor_nacional_id, ed.gestor_internacional_id)
    );
$$;

create or replace function public.manager_demanda_cliente_save(
  p_id bigint default null,
  p_cliente_id uuid default null,
  p_tipo text default null,
  p_status text default 'pendente',
  p_payload jsonb default '{}'::jsonb,
  p_target_gestor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_cliente_id uuid;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_id bigint;
begin
  if v_actor is null then
    raise exception 'manager_demanda_unauthenticated' using errcode = '42501';
  end if;

  if jsonb_typeof(v_payload) <> 'object' then
    raise exception 'manager_demanda_payload_must_be_object' using errcode = '23514';
  end if;

  if p_id is not null then
    select cliente_id
    into v_cliente_id
    from public.demandas_cliente
    where id = p_id;

    if v_cliente_id is null then
      raise exception 'manager_demanda_row_not_found' using errcode = 'P0002';
    end if;

    if not public.can_manage_client(v_cliente_id) then
      raise exception 'manager_demanda_forbidden' using errcode = '42501';
    end if;

    if not public.manager_demanda_target_gestor_allowed(v_cliente_id, p_target_gestor_id) then
      raise exception 'manager_demanda_target_gestor_forbidden' using errcode = '42501';
    end if;

    update public.demandas_cliente
    set
      tipo = coalesce(nullif(p_tipo, ''), tipo),
      status = coalesce(nullif(p_status, ''), status),
      payload = v_payload,
      target_gestor_id = coalesce(p_target_gestor_id, target_gestor_id),
      updated_at = now()
    where id = p_id
    returning id into v_id;

    return jsonb_build_object('ok', true, 'id', v_id);
  end if;

  if p_cliente_id is null then
    raise exception 'manager_demanda_missing_cliente_id' using errcode = '23514';
  end if;

  if not public.can_manage_client(p_cliente_id) then
    raise exception 'manager_demanda_forbidden' using errcode = '42501';
  end if;

  if not public.manager_demanda_target_gestor_allowed(p_cliente_id, p_target_gestor_id) then
    raise exception 'manager_demanda_target_gestor_forbidden' using errcode = '42501';
  end if;

  insert into public.demandas_cliente(
    cliente_id,
    tipo,
    status,
    payload,
    target_gestor_id
  )
  values (
    p_cliente_id,
    coalesce(nullif(p_tipo, ''), 'outros'),
    coalesce(nullif(p_status, ''), 'pendente'),
    v_payload,
    p_target_gestor_id
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.manager_demanda_target_gestor_allowed(uuid, uuid) from public, anon;
grant execute on function public.manager_demanda_target_gestor_allowed(uuid, uuid) to authenticated, service_role;

revoke all on function public.manager_demanda_cliente_save(bigint, uuid, text, text, jsonb, uuid) from public, anon;
grant execute on function public.manager_demanda_cliente_save(bigint, uuid, text, text, jsonb, uuid) to authenticated, service_role;

comment on function public.manager_demanda_target_gestor_allowed(uuid, uuid) is
  'Valida que o gestor alvo de uma demanda pertence ao cliente ou à dupla nacional/internacional do gestor logado.';

commit;
