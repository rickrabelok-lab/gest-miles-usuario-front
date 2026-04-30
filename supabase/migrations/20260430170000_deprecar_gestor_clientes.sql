-- Fase 6.B — Deprecar gestor_clientes (legado).
--
-- Diagnóstico (Fase 6.A): tudo o que existe em gestor_clientes (584) já está em
-- cliente_gestores (666). Front passou a ler só de cliente_gestores. Endpoints
-- backend que escreviam em gestor_clientes são dead code (sem chamadores).
--
-- Esta migration:
--   1. Drop policies de INSERT/UPDATE/DELETE (mantém SELECT durante grace period)
--   2. Revoke writes para anon/authenticated
--   3. Drop view dependente
--   4. Drop triggers (fill_nomes na tabela + propaga_nome em perfis)
--   5. Refatora 6 funções para não ler/escrever em gestor_clientes
--   6. Comment de deprecação na tabela
--
-- A tabela gestor_clientes CONTINUA EXISTINDO (só leitura) até a Fase 6.C, que
-- fará o drop completo após validação no app.

------------------------------------------------------------
-- 1) Drop policies de write (mantém SELECT temporariamente)
------------------------------------------------------------
drop policy if exists gestor_clientes_delete_admin_only on public.gestor_clientes;
drop policy if exists gestor_clientes_delete_staff      on public.gestor_clientes;
drop policy if exists gestor_clientes_insert_admin_only on public.gestor_clientes;
drop policy if exists gestor_clientes_insert_cs         on public.gestor_clientes;
drop policy if exists gestor_clientes_insert_own_or_admin on public.gestor_clientes;
drop policy if exists gestor_clientes_insert_staff      on public.gestor_clientes;
drop policy if exists gestor_clientes_update_admin_only on public.gestor_clientes;
drop policy if exists gestor_clientes_update_staff      on public.gestor_clientes;

------------------------------------------------------------
-- 2) Revoke writes para anon/authenticated
------------------------------------------------------------
revoke insert, update, delete on public.gestor_clientes from anon, authenticated;

------------------------------------------------------------
-- 3) Drop view dependente (não consumida pelo front)
------------------------------------------------------------
drop view if exists public.vw_gestor_clientes_com_nomes;

------------------------------------------------------------
-- 4) Drop triggers
------------------------------------------------------------
drop trigger if exists trg_gestor_clientes_fill_nomes on public.gestor_clientes;
drop function if exists public.trg_gestor_clientes_fill_nomes_from_perfis() cascade;

drop trigger if exists trg_perfis_propaga_nome_gestor_clientes on public.perfis;
drop function if exists public.trg_perfis_propaga_nome_gestor_clientes() cascade;

------------------------------------------------------------
-- 5) Refatorar funções
------------------------------------------------------------
-- 5.1 can_manage_client: remove o bloco "Gestor direto legado (gestor_clientes)"
create or replace function public.can_manage_client(target_cliente_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select coalesce(
    -- Próprio utilizador
    auth.uid() = target_cliente_id

    -- Plataforma (admin global legado)
    or public.is_legacy_platform_admin()

    -- Gestor direto (cliente_gestores) — fonte canônica
    or exists (
      select 1
      from public.cliente_gestores cg
      where cg.gestor_id = auth.uid()
        and cg.cliente_id = target_cliente_id
    )

    -- admin / admin_equipe: cliente na mesma equipe (perfis.equipe_id)
    or exists (
      select 1
      from public.perfis me
      join public.perfis c on c.equipe_id = me.equipe_id
      where me.usuario_id = auth.uid()
        and me.role in ('admin', 'admin_equipe')
        and me.equipe_id is not null
        and c.usuario_id = target_cliente_id
        and c.equipe_id is not null
    )

    -- admin / admin_equipe: cliente acompanhado por gestor da mesma equipe (perfis.equipe_id)
    or exists (
      select 1
      from public.cliente_gestores cg
      join public.perfis g  on g.usuario_id  = cg.gestor_id
      join public.perfis me on me.usuario_id = auth.uid()
      where cg.cliente_id = target_cliente_id
        and me.role in ('admin', 'admin_equipe')
        and me.equipe_id is not null
        and g.equipe_id = me.equipe_id
    )

    -- admin / admin_equipe: cliente acompanhado por gestor em equipe_gestores
    or exists (
      select 1
      from public.cliente_gestores cg
      inner join public.equipe_gestores eg on eg.gestor_id = cg.gestor_id
      join public.perfis me on me.usuario_id = auth.uid()
      where cg.cliente_id = target_cliente_id
        and me.role in ('admin', 'admin_equipe')
        and me.equipe_id is not null
        and eg.equipe_id = me.equipe_id
    )

    -- admin_equipe via equipe_admin + equipe_clientes
    or exists (
      select 1
      from public.equipe_clientes ec
      inner join public.equipe_admin ea
        on ea.equipe_id = ec.equipe_id
        and ea.ativo = true
      where ec.cliente_id = target_cliente_id
        and ec.ativo = true
        and (
          ea.admin_equipe_id_1 = auth.uid()
          or ea.admin_equipe_id_2 = auth.uid()
          or ea.admin_equipe_id_3 = auth.uid()
        )
    )

    -- CS supervisionado
    or public.can_cs_view_client(target_cliente_id),

    false
  );
$function$;

-- 5.2 can_cs_view_client: remove os 2 blocos "if to_regclass('public.gestor_clientes')"
create or replace function public.can_cs_view_client(target_cliente_id uuid)
returns boolean
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if public.is_legacy_platform_admin() then
    return true;
  end if;

  if public.team_admin_sees_user(target_cliente_id) then
    return true;
  end if;

  if exists (
    select 1
    from public.perfis pcs
    join public.perfis pgest on pgest.equipe_id is not distinct from pcs.equipe_id and pgest.role = 'gestor'
    join public.cliente_gestores cg2 on cg2.gestor_id = pgest.usuario_id
    where pcs.usuario_id = auth.uid()
      and pcs.role = 'cs'
      and pcs.equipe_id is not null
      and cg2.cliente_id = target_cliente_id
  ) then
    return true;
  end if;

  if exists (
    select 1
    from public.cs_gestores cg
    join public.cliente_gestores cg2 on cg2.gestor_id = cg.gestor_id
    where cg.cs_id = auth.uid()
      and cg2.cliente_id = target_cliente_id
  ) then
    return true;
  end if;

  if exists (
    select 1
    from public.equipe_cs ec
    join public.equipe_gestores eg on eg.equipe_id = ec.equipe_id
    join public.cliente_gestores cg2 on cg2.gestor_id = eg.gestor_id
    where ec.cs_id = auth.uid()
      and cg2.cliente_id = target_cliente_id
  ) then
    return true;
  end if;

  -- Mesma equipe operacional que o CS (perfis.equipe_id), cliente ainda sem gestor vinculado.
  if exists (
    select 1
    from public.perfis p_cli
    join public.perfis p_me on p_me.usuario_id = auth.uid()
      and p_me.role = 'cs'
      and p_me.equipe_id is not null
      and p_cli.equipe_id = p_me.equipe_id
    where p_cli.usuario_id = target_cliente_id
      and p_cli.role = 'cliente_gestao'
  ) then
    return true;
  end if;

  -- CS listado só em equipe_cs (perfis.equipe_id null) — mesma equipe que o cliente.
  if exists (
    select 1
    from public.perfis p_cli
    join public.equipe_cs ec on ec.equipe_id = p_cli.equipe_id and ec.cs_id = auth.uid()
    where p_cli.usuario_id = target_cliente_id
      and p_cli.role = 'cliente_gestao'
      and p_cli.equipe_id is not null
  ) then
    return true;
  end if;

  return false;
end;
$function$;

-- 5.3 _reconciliar_dupla_gestores: remove o bloco final em gestor_clientes
create or replace function public._reconciliar_dupla_gestores(p_equipe_id uuid, p_nac uuid, p_intl uuid)
returns integer
language plpgsql
volatile security definer
set search_path to 'public'
as $function$
declare
  v_cnt int := 0;
begin
  if p_nac is null or p_intl is null or p_nac = p_intl then
    return 0;
  end if;

  drop table if exists _dupla_clientes;
  create temp table _dupla_clientes (cliente_id uuid primary key);

  -- União: clientes já ligados a um dos dois (dentro desta equipe)
  insert into _dupla_clientes (cliente_id)
  select distinct cg.cliente_id
  from public.cliente_gestores cg
  inner join public.equipe_clientes ec
    on ec.cliente_id = cg.cliente_id and ec.equipe_id = p_equipe_id
  where cg.gestor_id in (p_nac, p_intl)
  on conflict (cliente_id) do nothing;

  -- Incluir clientes em equipe_clientes que já apontam para um dos dois
  insert into _dupla_clientes (cliente_id)
  select distinct ec.cliente_id
  from public.equipe_clientes ec
  where ec.equipe_id = p_equipe_id
    and (
      ec.gestor_nacional_id in (p_nac, p_intl)
      or ec.gestor_internacional_id in (p_nac, p_intl)
    )
  on conflict (cliente_id) do nothing;

  -- Remove vínculos antigos destes dois gestores só para clientes desta equipe
  delete from public.cliente_gestores cg
  using public.equipe_clientes ec
  where ec.equipe_id = p_equipe_id
    and ec.cliente_id = cg.cliente_id
    and cg.gestor_id in (p_nac, p_intl);

  -- Recria: cada cliente da dupla com os dois gestores
  insert into public.cliente_gestores (cliente_id, gestor_id)
  select d.cliente_id, p_nac from _dupla_clientes d
  where not exists (
    select 1 from public.cliente_gestores x
    where x.cliente_id = d.cliente_id and x.gestor_id = p_nac
  );

  insert into public.cliente_gestores (cliente_id, gestor_id)
  select d.cliente_id, p_intl from _dupla_clientes d
  where not exists (
    select 1 from public.cliente_gestores x
    where x.cliente_id = d.cliente_id and x.gestor_id = p_intl
  );

  -- Alinha equipe_clientes (dupla canônica)
  update public.equipe_clientes ec
  set
    gestor_nacional_id = p_nac,
    gestor_internacional_id = p_intl,
    updated_at = now()
  where ec.equipe_id = p_equipe_id
    and ec.cliente_id in (select cliente_id from _dupla_clientes);

  -- dupla_id (subequipe), se tabelas/colunas existirem
  if to_regclass('public.equipes_duplas') is not null
     and exists (
       select 1 from information_schema.columns c
       where c.table_schema = 'public' and c.table_name = 'equipe_clientes' and c.column_name = 'dupla_id'
     ) then
    update public.equipe_clientes ec
    set dupla_id = (
      select d.id
      from public.equipes_duplas d
      where d.equipe_id = p_equipe_id
        and d.gestor_nacional_id = p_nac
        and d.gestor_internacional_id = p_intl
      limit 1
    )
    where ec.equipe_id = p_equipe_id
      and ec.cliente_id in (select cliente_id from _dupla_clientes);
  end if;

  select count(*) into v_cnt from _dupla_clientes;
  drop table if exists _dupla_clientes;
  return v_cnt;
end;
$function$;

-- 5.4 cs_provisionar_cliente_gestao_completo: remove os 2 INSERTs em gestor_clientes
-- (mantém DEFAULT NULL nos parametros gestor_*_id, igual à assinatura original)
create or replace function public.cs_provisionar_cliente_gestao_completo(
  p_usuario_id uuid,
  p_equipe_id uuid,
  p_nome_completo text,
  p_email text,
  p_slug text,
  p_gestor_nacional_id uuid default null,
  p_gestor_intl_id uuid default null
)
returns void
language plpgsql
volatile security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception 'Sessao invalida.' using errcode = '28000';
  end if;

  -- 1. perfis
  insert into public.perfis (
    usuario_id, slug, nome_completo, email, role, configuracao_tema, equipe_id
  )
  values (
    p_usuario_id,
    p_slug,
    trim(p_nome_completo),
    lower(trim(p_email)),
    'cliente_gestao',
    '{}'::jsonb,
    p_equipe_id
  )
  on conflict (usuario_id) do update
    set nome_completo = excluded.nome_completo,
        email         = excluded.email,
        equipe_id     = excluded.equipe_id;

  -- 2. cliente_gestores: nacional
  if p_gestor_nacional_id is not null then
    insert into public.cliente_gestores (cliente_id, gestor_id)
    values (p_usuario_id, p_gestor_nacional_id)
    on conflict (cliente_id, gestor_id) do nothing;
  end if;

  -- 3. cliente_gestores: internacional (só se distinto do nacional)
  if p_gestor_intl_id is not null
     and p_gestor_intl_id is distinct from p_gestor_nacional_id then
    insert into public.cliente_gestores (cliente_id, gestor_id)
    values (p_usuario_id, p_gestor_intl_id)
    on conflict (cliente_id, gestor_id) do nothing;
  end if;

  -- 4. equipe_clientes
  if p_equipe_id is not null then
    insert into public.equipe_clientes (
      equipe_id, cliente_id, gestor_nacional_id, gestor_internacional_id, ativo
    )
    values (
      p_equipe_id,
      p_usuario_id,
      p_gestor_nacional_id,
      p_gestor_intl_id,
      true
    )
    on conflict (cliente_id) do update
      set equipe_id               = excluded.equipe_id,
          gestor_nacional_id      = excluded.gestor_nacional_id,
          gestor_internacional_id = excluded.gestor_internacional_id,
          ativo                   = true;
  end if;
end;
$function$;

-- 5.5 dupla_scores_refresh_snapshot: remove a UNION com gestor_clientes em dupla_clientes
create or replace function public.dupla_scores_refresh_snapshot()
returns integer
language plpgsql
volatile security definer
set search_path to 'public'
as $function$
declare
  n int := 0;
begin
  if not exists (
    select 1 from public.perfis p
    where p.usuario_id = auth.uid()
      and p.role in ('admin', 'admin_equipe', 'cs')
  ) then
    raise exception 'dupla_scores: apenas admin, admin_equipe ou cs podem atualizar o snapshot.';
  end if;

  insert into public.dupla_scores (
    dupla_key, equipe_id,
    score_total, score_nps, score_csat, score_sla,
    score_economia, score_retencao, score_renovacoes,
    clientes_ativos, clientes_inativos,
    media_anos_cliente, renovacoes_count,
    data_calculo
  )
  with dupla_tokens (dupla_key, token) as (
    values
      ('silmara-tiago',    'silmara'),
      ('silmara-tiago',    'tiago'),
      ('felipe-guilherme', 'felipe'),
      ('felipe-guilherme', 'filipe'),
      ('felipe-guilherme', 'guilherme'),
      ('felipe-guilherme', 'gui'),
      ('ana-diogo',        'ana'),
      ('ana-diogo',        'diogo'),
      ('rick-jessica',     'rick'),
      ('rick-jessica',     'jessica'),
      ('rick-jessica',     'jéssica'),
      ('carla-wesley',     'carla'),
      ('carla-wesley',     'wesley')
  ),
  gestor_map as (
    select distinct
      dt.dupla_key,
      p.usuario_id as gestor_id,
      public.perfis_equipe_id_safe(p.usuario_id) as equipe_id
    from dupla_tokens dt
    join public.perfis p
      on lower(split_part(trim(p.nome_completo), ' ', 1)) = dt.token
    where p.role in ('gestor', 'cs', 'admin_equipe')
  ),
  latest_gs as (
    select distinct on (gs.gestor_id)
      gs.gestor_id,
      gs.score_nps,
      gs.score_csat,
      gs.score_sla,
      gs.score_economia
    from public.gestor_scores gs
    order by gs.gestor_id, gs.data_calculo desc
  ),
  dupla_gs as (
    select
      gm.dupla_key,
      gm.equipe_id,
      coalesce(avg(lg.score_nps),      50) as avg_nps,
      coalesce(avg(lg.score_csat),     50) as avg_csat,
      coalesce(avg(lg.score_sla),      50) as avg_sla,
      coalesce(avg(lg.score_economia), 50) as avg_eco
    from gestor_map gm
    left join latest_gs lg on lg.gestor_id = gm.gestor_id
    group by gm.dupla_key, gm.equipe_id
  ),
  dupla_clientes as (
    select
      s.dupla_key,
      s.cliente_id
    from (
      select gm.dupla_key, cg.cliente_id
      from gestor_map gm
      join public.cliente_gestores cg on cg.gestor_id = gm.gestor_id
      union
      select gm.dupla_key, ec.cliente_id
      from gestor_map gm
      join public.equipe_clientes ec
        on coalesce(ec.ativo, true) = true
       and (
         ec.gestor_nacional_id = gm.gestor_id
         or ec.gestor_internacional_id = gm.gestor_id
       )
    ) s
    group by s.dupla_key, s.cliente_id
  ),
  client_status as (
    select
      dc.dupla_key,
      dc.cliente_id,
      cc.status_cliente
    from dupla_clientes dc
    join public.perfis pf on pf.usuario_id = dc.cliente_id
    left join lateral (
      select c.status_cliente
      from public.contratos_cliente c
      where (
        (nullif(lower(trim(c.cliente_email::text)), '') is not null
         and nullif(lower(trim(c.cliente_email::text)), '') in (
           nullif(lower(trim(pf.email::text)), ''),
           nullif(lower(trim(pf.configuracao_tema->'clientePerfil'->>'emailContato')), ''),
           nullif(lower(trim(pf.configuracao_tema->'clientePerfil'->>'email')), '')
         ))
        or (
          nullif(regexp_replace(lower(trim(c.cliente_nome::text)), '\s+', ' ', 'g'), '') is not null
          and nullif(regexp_replace(lower(trim(pf.nome_completo::text)), '\s+', ' ', 'g'), '') is not null
          and regexp_replace(lower(trim(c.cliente_nome::text)), '\s+', ' ', 'g')
            = regexp_replace(lower(trim(pf.nome_completo::text)), '\s+', ' ', 'g')
        )
      )
      order by coalesce(c.updated_at, c.created_at) desc nulls last
      limit 1
    ) cc on true
  ),
  counts as (
    select
      dupla_key,
      count(*) filter (where
        lower(trim(coalesce(status_cliente::text, ''))) in ('inativo', 'inactive')
      ) as inativos,
      count(*) filter (where
        lower(trim(coalesce(status_cliente::text, ''))) not in ('inativo', 'inactive')
      ) as ativos
    from client_status
    group by dupla_key
  ),
  retention as (
    select
      dc.dupla_key,
      coalesce(
        avg(
          extract(epoch from (now() - cc3.data_inicio::timestamptz)) / 86400 / 365
        ),
        0
      ) as avg_anos
    from dupla_clientes dc
    join public.perfis pf on pf.usuario_id = dc.cliente_id
    left join lateral (
      select c.data_inicio
      from public.contratos_cliente c
      where (
        (nullif(lower(trim(c.cliente_email::text)), '') is not null
         and nullif(lower(trim(c.cliente_email::text)), '') in (
           nullif(lower(trim(pf.email::text)), ''),
           nullif(lower(trim(pf.configuracao_tema->'clientePerfil'->>'emailContato')), ''),
           nullif(lower(trim(pf.configuracao_tema->'clientePerfil'->>'email')), '')
         ))
        or (
          nullif(regexp_replace(lower(trim(c.cliente_nome::text)), '\s+', ' ', 'g'), '') is not null
          and nullif(regexp_replace(lower(trim(pf.nome_completo::text)), '\s+', ' ', 'g'), '') is not null
          and regexp_replace(lower(trim(c.cliente_nome::text)), '\s+', ' ', 'g')
            = regexp_replace(lower(trim(pf.nome_completo::text)), '\s+', ' ', 'g')
        )
      )
        and lower(trim(coalesce(c.status_cliente::text, ''))) not in ('inativo', 'inactive')
      order by c.data_inicio asc nulls last
      limit 1
    ) cc3 on true
    group by dc.dupla_key
  ),
  renovacoes as (
    select
      dc.dupla_key,
      count(cc4.id) as cnt
    from dupla_clientes dc
    join public.perfis pf on pf.usuario_id = dc.cliente_id
    join public.contratos_cliente cc4
      on (
        (nullif(lower(trim(cc4.cliente_email::text)), '') is not null
         and nullif(lower(trim(cc4.cliente_email::text)), '') in (
           nullif(lower(trim(pf.email::text)), ''),
           nullif(lower(trim(pf.configuracao_tema->'clientePerfil'->>'emailContato')), ''),
           nullif(lower(trim(pf.configuracao_tema->'clientePerfil'->>'email')), '')
         ))
        or (
          nullif(regexp_replace(lower(trim(cc4.cliente_nome::text)), '\s+', ' ', 'g'), '') is not null
          and regexp_replace(lower(trim(cc4.cliente_nome::text)), '\s+', ' ', 'g')
            = regexp_replace(lower(trim(pf.nome_completo::text)), '\s+', ' ', 'g')
        )
      )
     and coalesce(cc4.renovacao_confirmada, false) = true
     and cc4.created_at >= now() - interval '365 days'
    group by dc.dupla_key
  ),
  scored as (
    select
      dg.dupla_key,
      dg.equipe_id,
      dg.avg_nps,
      dg.avg_csat,
      dg.avg_sla,
      dg.avg_eco,
      least(100, greatest(0,
        coalesce(r.avg_anos, 0) / 3.0 * 100
      )) as s_retencao,
      least(100, greatest(0,
        coalesce(rv.cnt, 0) * 10.0
      )) as s_renovacoes,
      coalesce(c.ativos,   0) as ativos,
      coalesce(c.inativos, 0) as inativos,
      coalesce(r.avg_anos, 0) as avg_anos,
      coalesce(rv.cnt, 0)     as renovacoes_cnt
    from dupla_gs dg
    left join counts    c  on c.dupla_key  = dg.dupla_key
    left join retention r  on r.dupla_key  = dg.dupla_key
    left join renovacoes rv on rv.dupla_key = dg.dupla_key
  )
  select
    s.dupla_key,
    s.equipe_id,
    round(
      0.20 * s.avg_nps     +
      0.20 * s.avg_csat    +
      0.15 * s.avg_sla     +
      0.20 * s.avg_eco     +
      0.15 * s.s_retencao  +
      0.10 * s.s_renovacoes,
      2
    ),
    round(s.avg_nps, 2),
    round(s.avg_csat, 2),
    round(s.avg_sla, 2),
    round(s.avg_eco, 2),
    round(s.s_retencao::numeric, 2),
    round(s.s_renovacoes::numeric, 2),
    s.ativos,
    s.inativos,
    round(s.avg_anos::numeric, 2),
    s.renovacoes_cnt,
    now()
  from scored s;

  get diagnostics n = row_count;
  return n;
end;
$function$;

-- 5.6 list_clientes_sem_dupla: remove a UNION com gestor_clientes
-- (mantém DEFAULT NULL no parametro, igual à assinatura original)
create or replace function public.list_clientes_sem_dupla(p_equipe_id uuid default null)
returns table (
  cliente_id uuid,
  nome_completo text,
  email text,
  avatar_iniciais text,
  status text,
  contrato_data_inicio date,
  contrato_data_vencimento date,
  contrato_valor numeric,
  contrato_renovacao boolean,
  contrato_updated_at timestamp with time zone,
  created_at timestamp with time zone
)
language sql
stable security definer
set search_path to 'public'
as $function$
  with dupla_tokens (token) as (
    values ('silmara'),('tiago'),('felipe'),('filipe'),('guilherme'),('gui'),
           ('ana'),('diogo'),('rick'),('jessica'),('jéssica'),('carla'),('wesley')
  ),
  gestor_map as (
    select distinct p.usuario_id as gestor_id
    from dupla_tokens dt
    join public.perfis p
      on lower(split_part(trim(p.nome_completo), ' ', 1)) = dt.token
    where p.role in ('gestor', 'cs', 'admin_equipe')
  ),
  dupla_clientes as (
    select distinct s.cliente_id
    from (
      select cg.cliente_id
        from gestor_map gm
        join public.cliente_gestores cg on cg.gestor_id = gm.gestor_id
      union
      select ec.cliente_id
        from gestor_map gm
        join public.equipe_clientes ec
          on coalesce(ec.ativo, true) = true
         and (ec.gestor_nacional_id = gm.gestor_id
              or ec.gestor_internacional_id = gm.gestor_id)
    ) s
  ),
  caller as (
    select p.usuario_id, p.role, p.equipe_id as caller_equipe
    from public.perfis p
    where p.usuario_id = auth.uid()
    limit 1
  ),
  target_equipe as (
    select coalesce(p_equipe_id, (select caller_equipe from caller)) as equipe_id
  ),
  orfaos as (
    select pf.*
    from public.perfis pf
    cross join caller c
    cross join target_equipe te
    where pf.role = 'cliente_gestao'
      and pf.usuario_id not in (select cliente_id from dupla_clientes)
      and (te.equipe_id is null or pf.equipe_id = te.equipe_id)
      and (
        c.role in ('admin', 'admin_equipe', 'cs')
        or c.caller_equipe = pf.equipe_id
      )
  )
  select
    o.usuario_id as cliente_id,
    coalesce(
      nullif(trim(o.nome_completo), ''),
      nullif(trim(o.nome), ''),
      split_part(coalesce(o.email, ''), '@', 1),
      'Sem nome'
    ) as nome_completo,
    coalesce(
      o.email,
      o.configuracao_tema->'clientePerfil'->>'emailContato',
      o.configuracao_tema->'clientePerfil'->>'email'
    ) as email,
    upper(substr(
      coalesce(nullif(trim(o.nome_completo), ''), nullif(trim(o.nome), ''), 'C'),
      1, 1
    )) as avatar_iniciais,
    coalesce(cc.status_cliente, 'sem_contrato') as status,
    cc.data_inicio as contrato_data_inicio,
    cc.data_vencimento as contrato_data_vencimento,
    cc.valor as contrato_valor,
    cc.renovacao_confirmada as contrato_renovacao,
    coalesce(cc.updated_at, cc.created_at) as contrato_updated_at,
    o.created_at
  from orfaos o
  left join lateral (
    select
      c.status_cliente,
      c.data_inicio,
      c.data_vencimento,
      c.valor,
      c.renovacao_confirmada,
      c.updated_at,
      c.created_at
    from public.contratos_cliente c
    where (
      (nullif(lower(trim(c.cliente_email::text)), '') is not null
       and nullif(lower(trim(c.cliente_email::text)), '') in (
         nullif(lower(trim(o.email::text)), ''),
         nullif(lower(trim(o.configuracao_tema->'clientePerfil'->>'emailContato')), ''),
         nullif(lower(trim(o.configuracao_tema->'clientePerfil'->>'email')), '')
       ))
      or (
        nullif(regexp_replace(lower(trim(c.cliente_nome::text)), '\s+', ' ', 'g'), '') is not null
        and regexp_replace(lower(trim(c.cliente_nome::text)), '\s+', ' ', 'g')
          = regexp_replace(lower(trim(o.nome_completo::text)), '\s+', ' ', 'g')
      )
    )
    order by coalesce(c.updated_at, c.created_at) desc nulls last
    limit 1
  ) cc on true
  order by
    case when lower(trim(coalesce(cc.status_cliente, ''))) in ('inativo', 'inactive') then 1 else 0 end,
    coalesce(cc.updated_at, cc.created_at, o.created_at) desc nulls last,
    o.nome_completo asc;
$function$;

------------------------------------------------------------
-- 6) Comment de deprecação na tabela
------------------------------------------------------------
comment on table public.gestor_clientes is
  'DEPRECATED — use public.cliente_gestores. Tabela com writes bloqueados (Fase 6.B). Será removida em Fase 6.C.';
