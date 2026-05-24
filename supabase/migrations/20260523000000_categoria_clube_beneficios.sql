-- supabase/migrations/20260523000000_categoria_clube_beneficios.sql

begin;

-- 1. Reconcile legacy clube_nome -> categoria without failing on partial states.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'programas_cliente'
      and column_name = 'clube_nome'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'programas_cliente'
      and column_name = 'categoria'
  ) then
    alter table public.programas_cliente rename column clube_nome to categoria;
  end if;
end $$;

alter table public.programas_cliente
  add column if not exists categoria text,
  add column if not exists clube_plano text default null,
  add column if not exists categoria_source text not null default 'manual',
  add column if not exists clube_plano_source text not null default 'manual',
  add column if not exists last_scraped_at timestamptz default null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'programas_cliente'
      and column_name = 'clube_nome'
  ) then
    update public.programas_cliente
    set categoria = coalesce(categoria, clube_nome)
    where categoria is null
      and clube_nome is not null;
  end if;
end $$;

-- 2. Beneficios por programa.
create table if not exists public.beneficios_programa_cliente (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references auth.users(id) on delete cascade,
  program_id text not null,
  tipo text not null,
  quantidade int not null default 1,
  validade date default null,
  notas text default null,
  source text not null default 'manual',
  scraped_at timestamptz default null,
  criado_por uuid references auth.users(id),
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

alter table public.beneficios_programa_cliente
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists cliente_id uuid references auth.users(id) on delete cascade,
  add column if not exists program_id text,
  add column if not exists tipo text,
  add column if not exists quantidade int not null default 1,
  add column if not exists validade date default null,
  add column if not exists notas text default null,
  add column if not exists source text not null default 'manual',
  add column if not exists scraped_at timestamptz default null,
  add column if not exists criado_por uuid references auth.users(id),
  add column if not exists criado_em timestamptz default now(),
  add column if not exists atualizado_em timestamptz default now();

alter table public.beneficios_programa_cliente enable row level security;

grant select, insert, update, delete on public.beneficios_programa_cliente to authenticated;
grant all on public.beneficios_programa_cliente to service_role;

drop policy if exists "beneficios: gestores e cs podem ver e editar" on public.beneficios_programa_cliente;
create policy "beneficios: gestores e cs podem ver e editar"
  on public.beneficios_programa_cliente
  for all
  using (public.can_manage_client(cliente_id))
  with check (public.can_manage_client(cliente_id));

create index if not exists idx_beneficios_cliente
  on public.beneficios_programa_cliente (cliente_id);

create index if not exists idx_beneficios_cliente_program
  on public.beneficios_programa_cliente (cliente_id, program_id);

create index if not exists idx_beneficios_validade
  on public.beneficios_programa_cliente (validade)
  where validade is not null;

-- 3. Recreate RPC after schema reconciliation. Accepts legacy clube_nome payloads.
create or replace function public.save_programa_cliente(
  p_cliente_id uuid,
  p_program_id text,
  p_payload jsonb,
  p_only_clube_nome boolean default false
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_has_categoria boolean := false;
  v_has_clube_plano boolean := false;
  v_categoria text;
  v_clube_plano text;
begin
  if auth.uid() is null then
    raise exception 'save_programa_cliente_unauthenticated' using errcode = '42501';
  end if;

  if p_cliente_id is null or nullif(trim(coalesce(p_program_id, '')), '') is null then
    raise exception 'save_programa_cliente_required_args' using errcode = '23514';
  end if;

  if jsonb_typeof(v_payload) <> 'object' then
    raise exception 'save_programa_cliente_payload_must_be_object' using errcode = '23514';
  end if;

  if not public.can_manage_client(p_cliente_id) then
    raise exception 'save_programa_cliente_forbidden' using errcode = '42501';
  end if;

  v_has_categoria := v_payload ? 'categoria' or v_payload ? 'clube_nome';
  v_has_clube_plano := v_payload ? 'clube_plano';
  v_categoria := nullif(coalesce(v_payload->>'categoria', v_payload->>'clube_nome'), '');
  v_clube_plano := nullif(v_payload->>'clube_plano', '');

  if coalesce(p_only_clube_nome, false) then
    update public.programas_cliente
    set
      categoria = case when v_has_categoria then v_categoria else categoria end,
      categoria_source = case when v_has_categoria then coalesce(nullif(v_payload->>'categoria_source', ''), 'manual') else categoria_source end,
      clube_plano = case when v_has_clube_plano then v_clube_plano else clube_plano end,
      clube_plano_source = case when v_has_clube_plano then coalesce(nullif(v_payload->>'clube_plano_source', ''), 'manual') else clube_plano_source end,
      last_scraped_at = case
        when v_payload ? 'last_scraped_at' then nullif(v_payload->>'last_scraped_at', '')::timestamptz
        else last_scraped_at
      end,
      updated_at = now()
    where cliente_id = p_cliente_id
      and program_id = p_program_id;

    if not found then
      raise exception 'save_programa_cliente_not_found' using errcode = 'P0002';
    end if;

    return;
  end if;

  insert into public.programas_cliente (
    cliente_id,
    program_id,
    program_name,
    logo,
    logo_color,
    logo_image_url,
    categoria,
    clube_plano,
    categoria_source,
    clube_plano_source,
    last_scraped_at,
    saldo,
    custo_medio_milheiro,
    custo_saldo,
    state,
    updated_at
  )
  values (
    p_cliente_id,
    p_program_id,
    coalesce(nullif(v_payload->>'program_name', ''), p_program_id),
    nullif(v_payload->>'logo', ''),
    nullif(v_payload->>'logo_color', ''),
    nullif(v_payload->>'logo_image_url', ''),
    v_categoria,
    v_clube_plano,
    coalesce(nullif(v_payload->>'categoria_source', ''), 'manual'),
    coalesce(nullif(v_payload->>'clube_plano_source', ''), 'manual'),
    nullif(v_payload->>'last_scraped_at', '')::timestamptz,
    coalesce(nullif(v_payload->>'saldo', '')::numeric, 0),
    coalesce(nullif(v_payload->>'custo_medio_milheiro', '')::numeric, 0),
    coalesce(nullif(v_payload->>'custo_saldo', '')::numeric, 0),
    coalesce(v_payload->'state', '{}'::jsonb),
    now()
  )
  on conflict (cliente_id, program_id) do update
  set
    program_name = excluded.program_name,
    logo = excluded.logo,
    logo_color = excluded.logo_color,
    logo_image_url = excluded.logo_image_url,
    categoria = excluded.categoria,
    clube_plano = excluded.clube_plano,
    categoria_source = excluded.categoria_source,
    clube_plano_source = excluded.clube_plano_source,
    last_scraped_at = excluded.last_scraped_at,
    saldo = excluded.saldo,
    custo_medio_milheiro = excluded.custo_medio_milheiro,
    custo_saldo = excluded.custo_saldo,
    state = excluded.state,
    updated_at = now();
end;
$function$;

revoke all on function public.save_programa_cliente(uuid, text, jsonb, boolean)
from public, anon;
grant execute on function public.save_programa_cliente(uuid, text, jsonb, boolean)
to authenticated, service_role;

revoke insert, update, delete on public.programas_cliente from authenticated;

commit;
