-- Import JSON: completar perfil órfão (auth.users existe, perfis não) sem depender só do WITH CHECK
-- da policy — o CS pode ter equipe resolvida por nome que não coincide com equipe_cs em edge cases.
-- Esta RPC valida o alcance (perfis.equipe_id, equipe_cs ou equipe_admin) e insere como SECURITY DEFINER.

create or replace function public.cs_import_ensure_perfil_cliente_gestao(
  p_usuario_id uuid,
  p_equipe_id uuid,
  p_nome_completo text,
  p_slug text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Sessão inválida.';
  end if;

  if exists (select 1 from public.perfis p where p.usuario_id = p_usuario_id) then
    return;
  end if;

  if not exists (select 1 from auth.users u where u.id = p_usuario_id) then
    raise exception 'Utilizador não encontrado em auth.users.';
  end if;

  if p_equipe_id is null then
    raise exception 'equipe_id é obrigatório para criar o perfil.';
  end if;

  if public.is_legacy_platform_admin() then
    insert into public.perfis (usuario_id, slug, nome_completo, role, configuracao_tema, equipe_id)
    values (p_usuario_id, p_slug, trim(p_nome_completo), 'cliente_gestao', '{}'::jsonb, p_equipe_id);
    return;
  end if;

  if not exists (
    select 1
    from public.perfis me
    where me.usuario_id = auth.uid()
      and me.role in ('cs', 'admin_equipe', 'admin', 'admin_master')
  ) then
    raise exception 'Apenas staff operacional (CS / admin de equipe) pode completar perfil órfão.';
  end if;

  if not (
    exists (
      select 1
      from public.perfis me
      where me.usuario_id = auth.uid()
        and me.equipe_id is not null
        and me.equipe_id = p_equipe_id
    )
    or exists (
      select 1
      from public.equipe_cs ec
      where ec.cs_id = auth.uid()
        and ec.equipe_id = p_equipe_id
    )
    or (
      to_regclass('public.equipe_admin') is not null
      and exists (
        select 1
        from public.equipe_admin ea
        where ea.equipe_id = p_equipe_id
          and coalesce(ea.ativo, true)
          and (
            ea.admin_equipe_id_1 = auth.uid()
            or ea.admin_equipe_id_2 = auth.uid()
            or ea.admin_equipe_id_3 = auth.uid()
          )
      )
    )
  ) then
    raise exception
      'A equipe escolhida para o import não coincide com o seu acesso (perfis.equipe_id, equipe_cs ou equipe_admin). '
      'Use a equipe à qual está vinculado ou peça para associar o seu utilizador em equipe_cs.';
  end if;

  insert into public.perfis (usuario_id, slug, nome_completo, role, configuracao_tema, equipe_id)
  values (p_usuario_id, p_slug, trim(p_nome_completo), 'cliente_gestao', '{}'::jsonb, p_equipe_id);
end;
$$;

comment on function public.cs_import_ensure_perfil_cliente_gestao(uuid, uuid, text, text) is
  'Import JSON: insere perfil cliente_gestao para auth existente sem perfil; valida escopo de equipe.';

revoke all on function public.cs_import_ensure_perfil_cliente_gestao(uuid, uuid, text, text) from public;
grant execute on function public.cs_import_ensure_perfil_cliente_gestao(uuid, uuid, text, text) to authenticated;
