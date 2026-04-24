-- 20260527120000_list_clientes_sem_dupla.sql
-- Lista todos os clientes da equipe (role='cliente_gestao') que NÃO estão
-- vinculados a nenhuma dupla de gestores (cliente_gestores, gestor_clientes
-- legado ou equipe_clientes nacional/internacional). Traz status de contrato
-- (ativo / inativo / sem_contrato), data de início, valor e última
-- movimentação — dados usados pela aba Gestores do AdminEquipeCrmDashboard.
--
-- A função respeita a equipe:
--   • admin, admin_equipe e cs enxergam todos os clientes sem dupla;
--   • demais perfis só enxergam clientes da própria equipe_id do chamador.
--
-- Se p_equipe_id for informado, filtra por aquela equipe. Caso contrário
-- usa a equipe_id do chamador.

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
  contrato_updated_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
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
      select gc.cliente_id
        from gestor_map gm
        join public.gestor_clientes gc on gc.gestor_id = gm.gestor_id
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
$$;

grant execute on function public.list_clientes_sem_dupla(uuid) to authenticated;
