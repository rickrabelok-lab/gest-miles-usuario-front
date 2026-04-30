-- =============================================================================
-- Fase 4a — Fonte canônica de leitura para carteira da dupla.
--
-- Objetivo:
--   1. View `vw_carteira_dupla` — universo canônico (equipe_clientes JOIN equipes_duplas
--      JOIN perfis cliente_gestao). É a verdade única da pergunta "quem é da dupla X".
--   2. RPC `carteira_dupla_kpis(p_equipe uuid)` — totais ao vivo de ativos/inativos por
--      dupla. Usada pelo CRM admin (substitui leitura de dupla_scores). Snapshot
--      `dupla_scores` continua existindo só para histórico/score.
--   3. Helper `contrato_cliente_visivel_por_usuario(...)` para RLS de contratos.
--   4. Atualiza RLS de `contratos_cliente` para permitir gestor/cs da carteira lerem.
--      Sem isso, painel do gestor mostra dados errados (motivo do bug 74 vs 69).
-- =============================================================================

-- 1) View canônica
create or replace view public.vw_carteira_dupla as
select
  d.id                       as dupla_id,
  d.nome                     as dupla_nome,
  d.equipe_id,
  d.gestor_nacional_id,
  d.gestor_internacional_id,
  ec.cliente_id,
  p.nome_completo            as cliente_nome,
  p.email                    as cliente_email,
  coalesce(p.cliente_status, 'ativo') as cliente_status
from public.equipes_duplas d
join public.equipe_clientes ec
  on ec.gestor_nacional_id = d.gestor_nacional_id
 and ec.gestor_internacional_id = d.gestor_internacional_id
join public.perfis p
  on p.usuario_id = ec.cliente_id
 and p.role = 'cliente_gestao';

comment on view public.vw_carteira_dupla is
  'Universo canônico de clientes_gestao por dupla (equipes_duplas JOIN equipe_clientes, casando os 2 gestores). Usar em vez de dupla_scores para contagens ao vivo.';

grant select on public.vw_carteira_dupla to authenticated;

-- 2) RPC: KPIs por dupla (ao vivo). Filtra por equipe (opcional) e respeita papel:
--    admin/admin_equipe/cs/admin_master/admin_geral → todas as duplas da equipe
--    gestor                                        → apenas duplas onde participa
create or replace function public.carteira_dupla_kpis(p_equipe uuid default null)
returns table (
  dupla_id uuid,
  dupla_nome text,
  equipe_id uuid,
  total integer,
  ativos integer,
  inativos integer,
  pct_ativos numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_role text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Sessão inválida.' using errcode = '28000';
  end if;

  select p.role into v_role from public.perfis p where p.usuario_id = v_uid;

  return query
  select
    d.id   as dupla_id,
    d.nome as dupla_nome,
    d.equipe_id,
    count(v.cliente_id)::int                                                          as total,
    count(v.cliente_id) filter (where v.cliente_status = 'ativo')::int                as ativos,
    count(v.cliente_id) filter (where v.cliente_status = 'inativo')::int              as inativos,
    case when count(v.cliente_id) = 0 then 0::numeric
         else round(100.0 * count(v.cliente_id) filter (where v.cliente_status = 'ativo')
                              / count(v.cliente_id), 2)
    end                                                                               as pct_ativos
  from public.equipes_duplas d
  left join public.vw_carteira_dupla v on v.dupla_id = d.id
  where (p_equipe is null or d.equipe_id = p_equipe)
    and (
      coalesce(v_role, '') in ('admin','admin_master','admin_geral','cs','admin_equipe')
      or (v_role = 'gestor' and (d.gestor_nacional_id = v_uid or d.gestor_internacional_id = v_uid))
    )
  group by d.id, d.nome, d.equipe_id
  order by d.nome;
end;
$$;

comment on function public.carteira_dupla_kpis(uuid) is
  'KPIs ao vivo por dupla (total/ativos/inativos/% ativos). Substitui leitura do snapshot dupla_scores no CRM admin.';

grant execute on function public.carteira_dupla_kpis(uuid) to authenticated;

-- 3) Helper: contrato é visível para o usuário atual (gestor da carteira ou cs)
create or replace function public.contrato_cliente_visivel_por_usuario(
  p_cliente_email text,
  p_cliente_nome text
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.perfis p
    where p.role = 'cliente_gestao'
      and (
        (
          nullif(lower(trim(coalesce(p_cliente_email,''))),'') is not null
          and lower(trim(coalesce(p_cliente_email,''))) in (
            nullif(lower(trim(coalesce(p.email,''))),''),
            nullif(lower(trim(coalesce(p.configuracao_tema->'clientePerfil'->>'emailContato',''))),''),
            nullif(lower(trim(coalesce(p.configuracao_tema->'clientePerfil'->>'email',''))),'')
          )
        )
        or (
          nullif(regexp_replace(lower(trim(coalesce(p_cliente_nome,''))),'\s+',' ','g'),'') is not null
          and regexp_replace(lower(trim(coalesce(p_cliente_nome,''))),'\s+',' ','g')
              = regexp_replace(lower(trim(coalesce(p.nome_completo,''))),'\s+',' ','g')
        )
      )
      and (
        public.can_manage_client(p.usuario_id)
        or public.can_cs_view_client(p.usuario_id)
      )
  );
$$;

comment on function public.contrato_cliente_visivel_por_usuario(text, text) is
  'RLS helper: o usuário atual é gestor da carteira (can_manage_client) ou CS (can_cs_view_client) do cliente cujo email/nome bate com o contrato.';

grant execute on function public.contrato_cliente_visivel_por_usuario(text, text) to authenticated;

-- 4) Atualiza RLS de contratos_cliente: gestor/cs da carteira pode LER
drop policy if exists contratos_cliente_select on public.contratos_cliente;
create policy contratos_cliente_select on public.contratos_cliente
for select
using (
  auth.uid() = created_by
  or public.is_legacy_platform_admin()
  or (equipe_id is not null and public.can_admin_equipe(equipe_id))
  or public.contrato_cliente_visivel_por_usuario(cliente_email, cliente_nome)
);

comment on policy contratos_cliente_select on public.contratos_cliente is
  'Permite leitura ao criador, admins legacy/equipe, e gestor/cs cuja carteira inclui o cliente. Veja migration 20260430150000.';
