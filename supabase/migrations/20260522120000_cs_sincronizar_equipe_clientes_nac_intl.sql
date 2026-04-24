-- Mesmo motivo de cs_vincular_cliente_gestores: INSERT/UPDATE em public.equipe_clientes
-- via supabase-js pode afectar 0 linhas (RLS USING) sem errcode.
-- SECURITY DEFINER + leitura pós-upsert (bypass RLS) + exception se nac/intl nao persistirem.
-- Retorno: uma linha com os UUIDs gravados (o app valida antes de mostrar sucesso).

create or replace function public.cs_sincronizar_equipe_clientes_nac_intl(
  p_cliente_id uuid,
  p_equipe_id uuid,
  p_gestor_nacional_id uuid,
  p_gestor_internacional_id uuid
)
returns table(
  gestor_nacional_id uuid,
  gestor_internacional_id uuid
)
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_role text;
  v_nac uuid;
  v_intl uuid;
begin
  if auth.uid() is null then
    raise exception 'Sessao invalida.' using errcode = '28000';
  end if;

  v_role := (
    select p.role
      from public.perfis p
     where p.usuario_id = auth.uid()
     limit 1
  );

  if v_role is null or v_role not in ('admin_master', 'admin_geral', 'admin_equipe', 'cs', 'admin') then
    raise exception 'Seu papel (%) nao pode sincronizar equipe_clientes.', coalesce(v_role, 'desconhecido')
      using errcode = '42501';
  end if;

  if p_cliente_id is null or p_equipe_id is null then
    raise exception 'cliente_id e equipe_id sao obrigatorios.' using errcode = '22023';
  end if;
  if p_gestor_nacional_id is null or p_gestor_internacional_id is null then
    raise exception 'gestor nacional e internacional sao obrigatorios.' using errcode = '22023';
  end if;
  if p_gestor_nacional_id = p_gestor_internacional_id then
    raise exception 'Nacional e internacional devem ser distintos.' using errcode = '22023';
  end if;

  if not exists (select 1 from auth.users u where u.id = p_cliente_id) then
    raise exception 'Cliente nao encontrado em auth.users.' using errcode = '23503';
  end if;

  insert into public.equipe_clientes (
    equipe_id,
    cliente_id,
    gestor_nacional_id,
    gestor_internacional_id,
    ativo
  )
  values (
    p_equipe_id,
    p_cliente_id,
    p_gestor_nacional_id,
    p_gestor_internacional_id,
    true
  )
  on conflict (cliente_id) do update
  set
    equipe_id = excluded.equipe_id,
    gestor_nacional_id = excluded.gestor_nacional_id,
    gestor_internacional_id = excluded.gestor_internacional_id,
    ativo = true;

  select e.gestor_nacional_id, e.gestor_internacional_id
  into v_nac, v_intl
  from public.equipe_clientes e
  where e.cliente_id = p_cliente_id;

  if v_nac is null or v_intl is null then
    raise exception
      'equipe_clientes: nac ou intl permanecem nulos apos upsert. Confirme em equipe_gestores o escopo nacional/internacional desta equipe (trigger validate_equipe_clientes_responsaveis).'
      using errcode = 'P0001';
  end if;

  if v_nac is distinct from p_gestor_nacional_id or v_intl is distinct from p_gestor_internacional_id then
    raise exception 'equipe_clientes: leitura pos-upsert nao corresponde ao pedido.' using errcode = 'P0001';
  end if;

  return query select v_nac, v_intl;
end
$func$;

revoke all on function public.cs_sincronizar_equipe_clientes_nac_intl(uuid, uuid, uuid, uuid) from public;
grant execute on function public.cs_sincronizar_equipe_clientes_nac_intl(uuid, uuid, uuid, uuid) to authenticated;

comment on function public.cs_sincronizar_equipe_clientes_nac_intl(uuid, uuid, uuid, uuid) is
  'Grava e devolve nac/intl em equipe_clientes (bypass RLS; falha se a linha nao refletir o pedido).';
