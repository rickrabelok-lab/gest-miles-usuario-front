-- AP-20260519-033 draft: fix functions reported by supabase db lint.
--
-- Safe/local status:
--   Prepared as local migration only. Do not apply without explicit approval.
--
-- Remote lint errors addressed:
--   1. _reconciliar_dupla_gestores: temp table is invisible to plpgsql_check.
--   2. registrar_emissao_atomico: legacy uuid argument compared to bigint id.
--   3. admin_update_user_identity_links: output column name conflicts with
--      ON CONFLICT column target inside PL/pgSQL.
--   4. insights_cliente_trigger_task_from_insight: conflict target did not
--      match the partial unique index on alertas_sistema(dedup_key).

begin;

create or replace function public._reconciliar_dupla_gestores(p_equipe_id uuid, p_nac uuid, p_intl uuid)
returns integer
language plpgsql
volatile
security definer
set search_path to 'public'
as $function$
declare
  v_cliente_ids uuid[] := array[]::uuid[];
begin
  if p_nac is null or p_intl is null or p_nac = p_intl then
    return 0;
  end if;

  select coalesce(array_agg(distinct src.cliente_id), array[]::uuid[])
    into v_cliente_ids
  from (
    select distinct cg.cliente_id
    from public.cliente_gestores cg
    inner join public.equipe_clientes ec
      on ec.cliente_id = cg.cliente_id
     and ec.equipe_id = p_equipe_id
    where cg.gestor_id in (p_nac, p_intl)

    union

    select distinct ec.cliente_id
    from public.equipe_clientes ec
    where ec.equipe_id = p_equipe_id
      and (
        ec.gestor_nacional_id in (p_nac, p_intl)
        or ec.gestor_internacional_id in (p_nac, p_intl)
      )
  ) src;

  if cardinality(v_cliente_ids) = 0 then
    return 0;
  end if;

  delete from public.cliente_gestores cg
  using public.equipe_clientes ec
  where ec.equipe_id = p_equipe_id
    and ec.cliente_id = cg.cliente_id
    and cg.gestor_id in (p_nac, p_intl)
    and ec.cliente_id = any(v_cliente_ids);

  insert into public.cliente_gestores (cliente_id, gestor_id)
  select d.cliente_id, p_nac
  from unnest(v_cliente_ids) as d(cliente_id)
  where not exists (
    select 1
    from public.cliente_gestores x
    where x.cliente_id = d.cliente_id
      and x.gestor_id = p_nac
  );

  insert into public.cliente_gestores (cliente_id, gestor_id)
  select d.cliente_id, p_intl
  from unnest(v_cliente_ids) as d(cliente_id)
  where not exists (
    select 1
    from public.cliente_gestores x
    where x.cliente_id = d.cliente_id
      and x.gestor_id = p_intl
  );

  update public.equipe_clientes ec
  set
    gestor_nacional_id = p_nac,
    gestor_internacional_id = p_intl,
    updated_at = now()
  where ec.equipe_id = p_equipe_id
    and ec.cliente_id = any(v_cliente_ids);

  if to_regclass('public.equipes_duplas') is not null
     and exists (
       select 1
       from information_schema.columns c
       where c.table_schema = 'public'
         and c.table_name = 'equipe_clientes'
         and c.column_name = 'dupla_id'
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
      and ec.cliente_id = any(v_cliente_ids);
  end if;

  return cardinality(v_cliente_ids);
end;
$function$;

create or replace function public.registrar_emissao_atomico(
  p_cliente_id uuid,
  p_programa text,
  p_origem text,
  p_destino text,
  p_classe text,
  p_data_ida date,
  p_data_volta date,
  p_milhas_utilizadas integer,
  p_taxa_embarque numeric,
  p_data_emissao date,
  p_usuario_responsavel uuid,
  p_observacoes text,
  p_programa_cliente_id uuid,
  p_novo_saldo integer,
  p_novo_state jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  raise exception 'registrar_emissao_atomico_deprecated_use_cliente_registrar_emissao'
    using errcode = '0A000';
end;
$function$;

create or replace function public.admin_update_user_identity_links(
  p_usuario_id uuid,
  p_nome_completo text,
  p_role text,
  p_equipe_id uuid default null,
  p_cliente_gestor_ids uuid[] default null,
  p_cliente_cs_ids uuid[] default null
)
returns table(usuario_id uuid, role text, equipe_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_actor_equipe_id uuid;
  v_target_role text;
  v_role text := lower(trim(coalesce(p_role, '')));
  v_nome text := nullif(trim(coalesce(p_nome_completo, '')), '');
  v_allowed_roles text[] := array[
    'admin',
    'admin_equipe',
    'cs',
    'gestor',
    'cliente',
    'cliente_gestao',
    'closer_baixo',
    'closer_alto',
    'closer_geral',
    'admin_geral'
  ];
  v_team_roles text[] := array[
    'admin_equipe',
    'cs',
    'gestor',
    'cliente_gestao',
    'closer_baixo',
    'closer_alto',
    'closer_geral'
  ];
  v_gestor_id uuid;
  v_cs_id uuid;
begin
  if v_actor is null then
    raise exception 'admin_identity_unauthenticated' using errcode = '42501';
  end if;

  select lower(trim(coalesce(p.role::text, ''))), p.equipe_id
    into v_actor_role, v_actor_equipe_id
  from public.perfis p
  where p.usuario_id = v_actor;

  if v_actor_role is null then
    raise exception 'admin_identity_forbidden' using errcode = '42501';
  end if;

  if v_actor_role not in ('admin_master', 'admin', 'admin_geral', 'admin_equipe') then
    raise exception 'admin_identity_forbidden' using errcode = '42501';
  end if;

  if v_role = '' or not (v_role = any(v_allowed_roles)) then
    raise exception 'invalid_role' using errcode = '23514';
  end if;

  if v_role = 'admin_master' then
    raise exception 'admin_master_role_not_mutable_by_panel' using errcode = '42501';
  end if;

  if v_role = any(v_team_roles) and p_equipe_id is null then
    raise exception 'equipe_id_required_for_role' using errcode = '23514';
  end if;

  select lower(trim(coalesce(p.role::text, '')))
    into v_target_role
  from public.perfis p
  where p.usuario_id = p_usuario_id
  for update;

  if not found then
    raise exception 'perfil_not_found' using errcode = '02000';
  end if;

  if v_target_role = 'admin_master' then
    raise exception 'admin_master_role_not_mutable_by_panel' using errcode = '42501';
  end if;

  if v_actor_role = 'admin_equipe' then
    if v_actor_equipe_id is null then
      raise exception 'admin_equipe_missing_scope' using errcode = '42501';
    end if;

    if p_equipe_id is distinct from v_actor_equipe_id then
      raise exception 'admin_equipe_cross_team_forbidden' using errcode = '42501';
    end if;

    if v_role in ('admin', 'admin_geral') then
      raise exception 'admin_equipe_role_forbidden' using errcode = '42501';
    end if;

    if not exists (
      select 1
      from public.perfis p
      where p.usuario_id = p_usuario_id
        and p.equipe_id = v_actor_equipe_id
    ) then
      raise exception 'admin_equipe_target_forbidden' using errcode = '42501';
    end if;
  end if;

  update public.perfis p
     set nome_completo = v_nome,
         role = v_role,
         equipe_id = p_equipe_id
   where p.usuario_id = p_usuario_id;

  if to_regclass('public.equipe_gestores') is not null then
    delete from public.equipe_gestores eg where eg.gestor_id = p_usuario_id;
    if v_role = 'gestor' then
      insert into public.equipe_gestores(equipe_id, gestor_id)
      values (p_equipe_id, p_usuario_id)
      on conflict on constraint equipe_gestores_pkey do nothing;
    end if;
  end if;

  if to_regclass('public.equipe_cs') is not null then
    delete from public.equipe_cs ec where ec.cs_id = p_usuario_id;
    if v_role = 'cs' then
      insert into public.equipe_cs(equipe_id, cs_id)
      values (p_equipe_id, p_usuario_id)
      on conflict on constraint equipe_cs_pkey do nothing;
    end if;
  end if;

  if v_role <> 'cliente_gestao' then
    if to_regclass('public.cliente_gestores') is not null then
      delete from public.cliente_gestores cg where cg.cliente_id = p_usuario_id;
    end if;
    if to_regclass('public.cliente_cs') is not null then
      delete from public.cliente_cs cc where cc.cliente_id = p_usuario_id;
    end if;
  else
    if p_cliente_gestor_ids is not null and to_regclass('public.cliente_gestores') is not null then
      delete from public.cliente_gestores cg where cg.cliente_id = p_usuario_id;

      foreach v_gestor_id in array coalesce(p_cliente_gestor_ids, array[]::uuid[]) loop
        if p_equipe_id is not null and exists (
          select 1 from public.perfis p where p.usuario_id = v_gestor_id
        ) and not exists (
          select 1
          from public.perfis p
          where p.usuario_id = v_gestor_id
            and lower(trim(coalesce(p.role::text, ''))) = 'gestor'
            and p.equipe_id = p_equipe_id
        ) then
          raise exception 'gestor_outside_cliente_equipe' using errcode = '23514';
        end if;

        insert into public.cliente_gestores(cliente_id, gestor_id)
        values (p_usuario_id, v_gestor_id)
        on conflict (cliente_id, gestor_id) do nothing;
      end loop;
    end if;

    if p_cliente_cs_ids is not null and to_regclass('public.cliente_cs') is not null then
      delete from public.cliente_cs cc where cc.cliente_id = p_usuario_id;

      foreach v_cs_id in array coalesce(p_cliente_cs_ids, array[]::uuid[]) loop
        if p_equipe_id is not null and exists (
          select 1 from public.perfis p where p.usuario_id = v_cs_id
        ) and not exists (
          select 1
          from public.perfis p
          where p.usuario_id = v_cs_id
            and lower(trim(coalesce(p.role::text, ''))) = 'cs'
            and p.equipe_id = p_equipe_id
        ) then
          raise exception 'cs_outside_cliente_equipe' using errcode = '23514';
        end if;

        insert into public.cliente_cs(cliente_id, cs_id)
        values (p_usuario_id, v_cs_id)
        on conflict (cliente_id, cs_id) do nothing;
      end loop;
    end if;
  end if;

  if to_regclass('public.logs_acoes') is not null then
    insert into public.logs_acoes(user_id, tipo_acao, entidade_afetada, entidade_id, details)
    values (
      v_actor,
      'admin_user_identity_links.update',
      'perfis',
      p_usuario_id::text,
      jsonb_build_object(
        'role_before', v_target_role,
        'role_after', v_role,
        'equipe_id', p_equipe_id,
        'cliente_gestor_ids_count', coalesce(array_length(p_cliente_gestor_ids, 1), 0),
        'cliente_cs_ids_count', coalesce(array_length(p_cliente_cs_ids, 1), 0)
      )
    );
  end if;

  return query
    select p.usuario_id, p.role::text, p.equipe_id
    from public.perfis p
    where p.usuario_id = p_usuario_id;
end;
$function$;

create or replace function public.insights_cliente_trigger_task_from_insight(p_insight_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  ins public.insights_cliente%rowtype;
  v_dedup text;
  v_alert_tipo text;
  v_alert_nivel text;
  v_alert_id uuid;
  v_mensagem text;
begin
  select *
  into ins
  from public.insights_cliente
  where id = p_insight_id;

  if not found then
    return;
  end if;

  if ins.status <> 'ativo' then
    return;
  end if;

  if not public.is_legacy_platform_admin() then
    if not (
      ins.gestor_id = auth.uid()
      or (ins.gestor_id is not null and public.cs_can_access_gestor(ins.gestor_id))
    ) then
      raise exception 'insights_cliente: sem permissao';
    end if;
  end if;

  v_dedup := 'INSIGHT_TASK:' || ins.id::text;

  if exists (
    select 1
    from public.tarefas_cs t
    join public.alertas_sistema a on a.id = t.alerta_id
    where a.dedup_key = v_dedup
  ) then
    return;
  end if;

  v_alert_nivel := ins.nivel;

  if ins.tipo_insight = 'CHURN_RISK' then
    v_alert_tipo := 'NPS_LOW';
  elsif ins.tipo_insight = 'SATISFACTION_DROP' then
    v_alert_tipo := 'CSAT_LOW';
  elsif ins.tipo_insight = 'LOW_USAGE' then
    v_alert_tipo := 'CLIENT_INACTIVITY';
  elsif ins.tipo_insight = 'EMISSION_OPPORTUNITY' then
    v_alert_tipo := 'GESTOR_SCORE_DROP';
  elsif ins.tipo_insight = 'UPSELL_OPPORTUNITY' then
    v_alert_tipo := 'NPS_LOW';
  elsif ins.tipo_insight = 'HIGH_ENGAGEMENT' then
    v_alert_tipo := 'GESTOR_SCORE_DROP';
  else
    v_alert_tipo := 'CSAT_LOW';
  end if;

  v_mensagem := 'Insight acionavel: ' || ins.titulo || '. ' || ins.descricao;

  insert into public.alertas_sistema (
    tipo_alerta, cliente_id, gestor_id, equipe_id,
    nivel, mensagem, status, dedup_key
  )
  values (
    v_alert_tipo,
    ins.cliente_id,
    ins.gestor_id,
    ins.equipe_id,
    v_alert_nivel,
    v_mensagem,
    'ativo',
    v_dedup
  )
  on conflict (dedup_key) where (status = 'ativo') do nothing;

  select a.id
  into v_alert_id
  from public.alertas_sistema a
  where a.dedup_key = v_dedup
  order by a.data_criacao desc
  limit 1;

  if v_alert_id is not null then
    perform public.tarefas_cs_create_from_alerta(v_alert_id);
  end if;

  update public.alertas_sistema
  set status = 'resolvido',
      data_resolucao = now()
  where dedup_key = v_dedup
    and status = 'ativo';
end;
$function$;

commit;
