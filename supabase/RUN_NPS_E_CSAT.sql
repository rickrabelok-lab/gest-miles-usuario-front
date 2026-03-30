-- =============================================================================
-- NPS + CSAT: rode UMA VEZ no Supabase (corrige "Could not find table ... schema cache")
-- Painel: https://supabase.com/dashboard → seu projeto → SQL Editor → New query → Run
--
-- Precisa já existir: equipes, perfis, cliente_gestores, emissoes,
-- funções cs_can_access_gestor e is_legacy_platform_admin.
--
-- Depois: espere ~1 min ou recarregue o app (PostgREST atualiza o cache do schema).
-- Ou use: supabase db push (projeto linkado).
-- =============================================================================


-- NPS: avaliações cliente_gestao → gestor, convites (90d + pós-emissão), RLS por equipe.

-- ---------------------------------------------------------------------------
-- 1) Tabelas
-- ---------------------------------------------------------------------------

create table if not exists public.nps_avaliacoes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references auth.users (id) on delete cascade,
  gestor_id uuid not null references auth.users (id) on delete cascade,
  equipe_id uuid references public.equipes (id) on delete set null,
  nota smallint not null check (nota >= 0 and nota <= 10),
  classificacao text not null check (classificacao in ('detrator', 'neutro', 'promotor')),
  comentario text,
  data_avaliacao timestamptz not null default now()
);

create index if not exists idx_nps_avaliacoes_gestor_id on public.nps_avaliacoes (gestor_id);
create index if not exists idx_nps_avaliacoes_cliente_id on public.nps_avaliacoes (cliente_id);
create index if not exists idx_nps_avaliacoes_equipe_id on public.nps_avaliacoes (equipe_id);
create index if not exists idx_nps_avaliacoes_data on public.nps_avaliacoes (data_avaliacao desc);
create index if not exists idx_nps_avaliacoes_classificacao on public.nps_avaliacoes (classificacao);

create table if not exists public.nps_convites (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references auth.users (id) on delete cascade,
  gestor_id uuid not null references auth.users (id) on delete cascade,
  equipe_id uuid references public.equipes (id) on delete set null,
  motivo text not null check (motivo in ('periodic_90d', 'emisao')),
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  nps_avaliacao_id uuid references public.nps_avaliacoes (id) on delete set null
);

create index if not exists idx_nps_convites_cliente on public.nps_convites (cliente_id);
create index if not exists idx_nps_convites_gestor on public.nps_convites (gestor_id);
create index if not exists idx_nps_convites_pending on public.nps_convites (cliente_id, gestor_id)
  where consumed_at is null;

-- ---------------------------------------------------------------------------
-- 2) Classificação e validação (nps_avaliacoes)
-- ---------------------------------------------------------------------------

create or replace function public.nps_classificar_nota(n smallint)
returns text
language sql
immutable
as $$
  select case
    when n <= 6 then 'detrator'
    when n <= 8 then 'neutro'
    else 'promotor'
  end;
$$;

create or replace function public.nps_avaliacoes_set_classificacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.classificacao := public.nps_classificar_nota(new.nota);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2a) Helpers: perfis sem coluna equipe_id (legado) — usam EXECUTE para não falhar no CREATE FUNCTION
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

drop trigger if exists trg_nps_avaliacoes_classificacao on public.nps_avaliacoes;
create trigger trg_nps_avaliacoes_classificacao
  before insert or update of nota on public.nps_avaliacoes
  for each row
  execute procedure public.nps_avaliacoes_set_classificacao();

create or replace function public.nps_validate_avaliacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c_role text;
  g_equipe uuid;
  c_equipe uuid;
begin
  select p.role into c_role from public.perfis p where p.usuario_id = new.cliente_id limit 1;
  c_equipe := public.perfis_equipe_id_safe(new.cliente_id);
  if c_role is distinct from 'cliente_gestao' then
    raise exception 'nps_avaliacoes: apenas usuários com role cliente_gestao podem ser avaliados como cliente.';
  end if;

  if not exists (
    select 1 from public.cliente_gestores cg
    where cg.cliente_id = new.cliente_id and cg.gestor_id = new.gestor_id
  ) then
    raise exception 'nps_avaliacoes: deve existir vínculo em cliente_gestores.';
  end if;

  g_equipe := public.perfis_equipe_id_safe(new.gestor_id);

  if g_equipe is not null then
    if c_equipe is distinct from g_equipe then
      raise exception 'nps_avaliacoes: cliente e gestor devem ter o mesmo equipe_id.';
    end if;
  end if;

  if new.equipe_id is null then
    new.equipe_id := coalesce(c_equipe, g_equipe);
  elsif new.equipe_id is distinct from coalesce(c_equipe, g_equipe) and coalesce(c_equipe, g_equipe) is not null then
    raise exception 'nps_avaliacoes: equipe_id inconsistente com perfis.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_nps_validate_avaliacao on public.nps_avaliacoes;
create trigger trg_nps_validate_avaliacao
  before insert or update on public.nps_avaliacoes
  for each row
  execute procedure public.nps_validate_avaliacao();

create or replace function public.nps_after_avaliacao_consume_convites()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.nps_convites
  set consumed_at = now(),
      nps_avaliacao_id = new.id
  where cliente_id = new.cliente_id
    and gestor_id = new.gestor_id
    and consumed_at is null;
  return new;
end;
$$;

drop trigger if exists trg_nps_consume_convites on public.nps_avaliacoes;
create trigger trg_nps_consume_convites
  after insert on public.nps_avaliacoes
  for each row
  execute procedure public.nps_after_avaliacao_consume_convites();

-- ---------------------------------------------------------------------------
-- 3) Convite após emissão (INSERT em emissoes)
-- ---------------------------------------------------------------------------

create or replace function public.nps_after_emissao_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  eq uuid;
  c_role text;
begin
  select p.role into c_role from public.perfis p where p.usuario_id = new.cliente_id limit 1;
  if c_role is distinct from 'cliente_gestao' then
    return new;
  end if;

  if not exists (
    select 1 from public.cliente_gestores cg
    where cg.cliente_id = new.cliente_id and cg.gestor_id = new.usuario_responsavel
  ) then
    return new;
  end if;

  if exists (
    select 1 from public.nps_convites nc
    where nc.cliente_id = new.cliente_id
      and nc.gestor_id = new.usuario_responsavel
      and nc.consumed_at is null
  ) then
    return new;
  end if;

  eq := coalesce(
    public.perfis_equipe_id_safe(new.cliente_id),
    public.perfis_equipe_id_safe(new.usuario_responsavel)
  );

  insert into public.nps_convites (cliente_id, gestor_id, equipe_id, motivo)
  values (new.cliente_id, new.usuario_responsavel, eq, 'emisao');

  return new;
end;
$$;

-- Só anexa trigger se public.emissoes existir (migration 20260308120000_emissoes.sql).
do $$
begin
  if to_regclass('public.emissoes') is not null then
    drop trigger if exists trg_nps_emissao_convite on public.emissoes;
    create trigger trg_nps_emissao_convite
      after insert on public.emissoes
      for each row
      execute procedure public.nps_after_emissao_insert();
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4) RPC: convites periódicos (90 dias) — chamado pelo app (cliente_gestao)
-- ---------------------------------------------------------------------------

create or replace function public.nps_seed_convites_periodicos()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  last_av timestamptz;
  inserted_n int := 0;
begin
  if not exists (
    select 1 from public.perfis p where p.usuario_id = auth.uid() and p.role = 'cliente_gestao'
  ) then
    return 0;
  end if;

  for r in
    select
      cg.gestor_id,
      coalesce(
        public.perfis_equipe_id_safe(cg.cliente_id),
        public.perfis_equipe_id_safe(cg.gestor_id)
      ) as equipe_id
    from public.cliente_gestores cg
    where cg.cliente_id = auth.uid()
  loop
    select max(a.data_avaliacao) into last_av
    from public.nps_avaliacoes a
    where a.cliente_id = auth.uid() and a.gestor_id = r.gestor_id;

    if last_av is not null and last_av > now() - interval '90 days' then
      continue;
    end if;

    if exists (
      select 1 from public.nps_convites nc
      where nc.cliente_id = auth.uid()
        and nc.gestor_id = r.gestor_id
        and nc.consumed_at is null
    ) then
      continue;
    end if;

    insert into public.nps_convites (cliente_id, gestor_id, equipe_id, motivo)
    values (auth.uid(), r.gestor_id, r.equipe_id, 'periodic_90d');
    inserted_n := inserted_n + 1;
  end loop;

  return inserted_n;
end;
$$;

grant execute on function public.nps_seed_convites_periodicos() to authenticated;

-- ---------------------------------------------------------------------------
-- 5) RLS nps_avaliacoes
-- ---------------------------------------------------------------------------

alter table public.nps_avaliacoes enable row level security;

drop policy if exists nps_avaliacoes_select on public.nps_avaliacoes;
create policy nps_avaliacoes_select on public.nps_avaliacoes
  for select
  using (
    cliente_id = auth.uid()
    or gestor_id = auth.uid()
    or public.is_legacy_platform_admin()
    or public.cs_can_access_gestor(gestor_id)
    or public.rls_team_admin_matches_equipe(nps_avaliacoes.equipe_id)
  );

drop policy if exists nps_avaliacoes_insert on public.nps_avaliacoes;
create policy nps_avaliacoes_insert on public.nps_avaliacoes
  for insert
  with check (
    auth.uid() = cliente_id
    and exists (
      select 1 from public.perfis p
      where p.usuario_id = auth.uid() and p.role = 'cliente_gestao'
    )
  );

-- Sem UPDATE/DELETE pelo cliente (auditoria); apenas legado admin
drop policy if exists nps_avaliacoes_delete on public.nps_avaliacoes;
create policy nps_avaliacoes_delete on public.nps_avaliacoes
  for delete
  using (public.is_legacy_platform_admin());

-- ---------------------------------------------------------------------------
-- 6) RLS nps_convites
-- ---------------------------------------------------------------------------

alter table public.nps_convites enable row level security;

drop policy if exists nps_convites_select on public.nps_convites;
create policy nps_convites_select on public.nps_convites
  for select
  using (
    cliente_id = auth.uid()
    or public.is_legacy_platform_admin()
    or public.cs_can_access_gestor(gestor_id)
    or public.rls_team_admin_matches_equipe(nps_convites.equipe_id)
  );

-- Convites por emissão: INSERT via trigger SECURITY DEFINER (bypass RLS).
-- Convites 90d: INSERT via RPC como cliente autenticado.
drop policy if exists nps_convites_insert on public.nps_convites;
drop policy if exists nps_convites_insert_cliente_periodic on public.nps_convites;
create policy nps_convites_insert_cliente_periodic on public.nps_convites
  for insert
  with check (
    auth.uid() = cliente_id
    and motivo = 'periodic_90d'
    and exists (select 1 from public.perfis p where p.usuario_id = auth.uid() and p.role = 'cliente_gestao')
  );

-- Trigger em emissoes roda como owner da função — precisa BYPASSRLS no role ou policy permissiva para sistema
-- Em Supabase, security definer functions owned by postgres bypass RLS. Inserts from trigger should work.

drop policy if exists nps_convites_update on public.nps_convites;
create policy nps_convites_update on public.nps_convites
  for update
  using (
    cliente_id = auth.uid()
    or public.is_legacy_platform_admin()
  )
  with check (
    cliente_id = auth.uid()
    or public.is_legacy_platform_admin()
  );


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
