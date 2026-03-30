-- CSAT mensal (1–5): cliente_gestao avalia gestor; uma linha por (cliente, gestor, mês).

-- ---------------------------------------------------------------------------
-- 1) Tabela
-- ---------------------------------------------------------------------------

create table if not exists public.csat_avaliacoes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references auth.users (id) on delete cascade,
  gestor_id uuid not null references auth.users (id) on delete cascade,
  equipe_id uuid references public.equipes (id) on delete set null,
  nota smallint not null check (nota >= 1 and nota <= 5),
  comentario text,
  mes_referencia date not null,
  data_avaliacao timestamptz not null default now(),
  constraint csat_avaliacoes_mes_primeiro_dia check (
    mes_referencia = (date_trunc('month', mes_referencia::timestamp))::date
  ),
  constraint csat_avaliacoes_unique_mes unique (cliente_id, gestor_id, mes_referencia)
);

create index if not exists idx_csat_avaliacoes_gestor_id on public.csat_avaliacoes (gestor_id);
create index if not exists idx_csat_avaliacoes_cliente_id on public.csat_avaliacoes (cliente_id);
create index if not exists idx_csat_avaliacoes_equipe_id on public.csat_avaliacoes (equipe_id);
create index if not exists idx_csat_avaliacoes_mes on public.csat_avaliacoes (mes_referencia desc);
create index if not exists idx_csat_avaliacoes_data on public.csat_avaliacoes (data_avaliacao desc);

-- ---------------------------------------------------------------------------
-- 1b) Helpers (legado sem perfis.equipe_id) — CREATE OR REPLACE; idênticos ao NPS
-- ---------------------------------------------------------------------------

create or replace function public.perfis_equipe_id_safe(p_usuario uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v uuid;
begin
  if not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'perfis'
      and c.column_name = 'equipe_id'
  ) then
    return null;
  end if;
  execute 'select equipe_id from public.perfis where usuario_id = $1 limit 1'
    into v
    using p_usuario;
  return v;
end;
$$;

create or replace function public.rls_team_admin_matches_equipe(target_equipe uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ok boolean;
begin
  if target_equipe is null then
    return false;
  end if;
  if not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'perfis'
      and c.column_name = 'equipe_id'
  ) then
    return false;
  end if;
  execute $q$
    select exists (
      select 1 from public.perfis me
      where me.usuario_id = auth.uid()
        and me.role = 'admin'
        and me.equipe_id is not null
        and me.equipe_id is not distinct from $1
    )
  $q$
    into ok
    using target_equipe;
  return coalesce(ok, false);
end;
$$;

create or replace function public.is_legacy_platform_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ok boolean;
begin
  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'perfis'
      and c.column_name = 'equipe_id'
  ) then
    execute $q$
      select coalesce(
        (
          select p.role = 'admin' and p.equipe_id is null
          from public.perfis p
          where p.usuario_id = auth.uid()
          limit 1
        ),
        false
      )
    $q$ into ok;
  else
    execute $q$
      select coalesce(
        (select p.role = 'admin' from public.perfis p where p.usuario_id = auth.uid() limit 1),
        false
      )
    $q$ into ok;
  end if;
  return coalesce(ok, false);
end;
$$;

grant execute on function public.perfis_equipe_id_safe(uuid) to authenticated;
grant execute on function public.rls_team_admin_matches_equipe(uuid) to authenticated;
grant execute on function public.is_legacy_platform_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Validação (vínculo, equipe, mês corrente)
-- ---------------------------------------------------------------------------

create or replace function public.csat_mes_corrente_brt()
returns date
language sql
stable
as $$
  select (date_trunc('month', (current_timestamp at time zone 'America/Sao_Paulo')))::date;
$$;

create or replace function public.csat_validate_avaliacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c_role text;
  g_equipe uuid;
  c_equipe uuid;
  mes_ok date;
begin
  new.mes_referencia := (date_trunc('month', new.mes_referencia::timestamp))::date;

  mes_ok := public.csat_mes_corrente_brt();
  if new.mes_referencia <> mes_ok then
    raise exception 'csat_avaliacoes: só é permitido registrar avaliação do mês corrente.';
  end if;

  select p.role into c_role from public.perfis p where p.usuario_id = new.cliente_id limit 1;
  c_equipe := public.perfis_equipe_id_safe(new.cliente_id);
  if c_role is distinct from 'cliente_gestao' then
    raise exception 'csat_avaliacoes: apenas cliente_gestao pode ser cliente na avaliação.';
  end if;

  if not exists (
    select 1 from public.cliente_gestores cg
    where cg.cliente_id = new.cliente_id and cg.gestor_id = new.gestor_id
  ) then
    raise exception 'csat_avaliacoes: cliente deve estar vinculado ao gestor em cliente_gestores.';
  end if;

  g_equipe := public.perfis_equipe_id_safe(new.gestor_id);

  if g_equipe is not null then
    if c_equipe is distinct from g_equipe then
      raise exception 'csat_avaliacoes: cliente e gestor devem pertencer à mesma equipe.';
    end if;
  end if;

  if new.equipe_id is null then
    new.equipe_id := coalesce(c_equipe, g_equipe);
  elsif new.equipe_id is distinct from coalesce(c_equipe, g_equipe) and coalesce(c_equipe, g_equipe) is not null then
    raise exception 'csat_avaliacoes: equipe_id inconsistente com perfis.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_csat_validate_avaliacao on public.csat_avaliacoes;
create trigger trg_csat_validate_avaliacao
  before insert on public.csat_avaliacoes
  for each row
  execute procedure public.csat_validate_avaliacao();

-- ---------------------------------------------------------------------------
-- 3) RPC: pendentes do mês corrente (para modal no app)
-- ---------------------------------------------------------------------------

create or replace function public.csat_pending_avaliacoes()
returns table (gestor_id uuid, equipe_id uuid, mes_referencia date)
language plpgsql
security definer
set search_path = public
as $$
declare
  m date := public.csat_mes_corrente_brt();
begin
  if not exists (
    select 1 from public.perfis p where p.usuario_id = auth.uid() and p.role = 'cliente_gestao'
  ) then
    return;
  end if;

  return query
  select
    cg.gestor_id,
    coalesce(
      public.perfis_equipe_id_safe(cg.cliente_id),
      public.perfis_equipe_id_safe(cg.gestor_id)
    ),
    m
  from public.cliente_gestores cg
  where cg.cliente_id = auth.uid()
    and not exists (
      select 1 from public.csat_avaliacoes a
      where a.cliente_id = cg.cliente_id
        and a.gestor_id = cg.gestor_id
        and a.mes_referencia = m
    );
end;
$$;

grant execute on function public.csat_pending_avaliacoes() to authenticated;

-- ---------------------------------------------------------------------------
-- 4) RLS
-- ---------------------------------------------------------------------------

alter table public.csat_avaliacoes enable row level security;

drop policy if exists csat_avaliacoes_select on public.csat_avaliacoes;
create policy csat_avaliacoes_select on public.csat_avaliacoes
  for select
  using (
    cliente_id = auth.uid()
    or gestor_id = auth.uid()
    or public.is_legacy_platform_admin()
    or public.cs_can_access_gestor(gestor_id)
    or public.rls_team_admin_matches_equipe(csat_avaliacoes.equipe_id)
  );

drop policy if exists csat_avaliacoes_insert on public.csat_avaliacoes;
create policy csat_avaliacoes_insert on public.csat_avaliacoes
  for insert
  with check (
    auth.uid() = cliente_id
    and exists (
      select 1 from public.perfis p
      where p.usuario_id = auth.uid() and p.role = 'cliente_gestao'
    )
  );

drop policy if exists csat_avaliacoes_delete on public.csat_avaliacoes;
create policy csat_avaliacoes_delete on public.csat_avaliacoes
  for delete
  using (public.is_legacy_platform_admin());
