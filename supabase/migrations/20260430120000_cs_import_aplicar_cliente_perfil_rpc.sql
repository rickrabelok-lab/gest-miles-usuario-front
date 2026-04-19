-- Import JSON: aplicar patch de perfil (scalars + configuracao_tema.clientePerfil) como
-- SECURITY DEFINER. Antes, o UPDATE direto por supabase-js em perfis.configuracao_tema
-- era silenciosamente filtrado por RLS (USING não batia para staff em alguns cenários),
-- retornando sucesso com 0 linhas afetadas e clientePerfil nunca persistia.

create or replace function public.cs_import_aplicar_cliente_perfil(
  p_usuario_id uuid,
  p_nome_completo text,
  p_email text,
  p_cpf text,
  p_data_nascimento date,
  p_endereco text,
  p_equipe_id uuid,
  p_cliente_perfil_patch jsonb
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $func$
declare
  v_target_equipe uuid;
  v_cur_cfg jsonb;
  v_cur_perfil jsonb;
  v_next_perfil jsonb;
  v_next_cfg jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sessão inválida.';
  end if;

  if not exists (select 1 from public.perfis p where p.usuario_id = p_usuario_id) then
    raise exception 'Perfil alvo não existe.';
  end if;

  v_target_equipe := (select p.equipe_id from public.perfis p where p.usuario_id = p_usuario_id);

  if not public.is_legacy_platform_admin() then
    if not exists (
      select 1 from public.perfis me
      where me.usuario_id = auth.uid()
        and me.role in ('cs','admin_equipe','admin','admin_master')
    ) then
      raise exception 'Apenas staff operacional pode aplicar patch em cliente_gestao.';
    end if;

    if not (
      coalesce(v_target_equipe, p_equipe_id) is not null
      and (
        exists (
          select 1 from public.perfis me
          where me.usuario_id = auth.uid()
            and me.equipe_id is not null
            and me.equipe_id in (
              coalesce(v_target_equipe, p_equipe_id),
              coalesce(p_equipe_id, v_target_equipe)
            )
        )
        or exists (
          select 1 from public.equipe_cs ec
          where ec.cs_id = auth.uid()
            and ec.equipe_id in (
              coalesce(v_target_equipe, p_equipe_id),
              coalesce(p_equipe_id, v_target_equipe)
            )
        )
        or (
          to_regclass('public.equipe_admin') is not null
          and exists (
            select 1 from public.equipe_admin ea
            where ea.equipe_id in (
                coalesce(v_target_equipe, p_equipe_id),
                coalesce(p_equipe_id, v_target_equipe)
              )
              and coalesce(ea.ativo, true)
              and (
                ea.admin_equipe_id_1 = auth.uid()
                or ea.admin_equipe_id_2 = auth.uid()
                or ea.admin_equipe_id_3 = auth.uid()
              )
          )
        )
      )
    ) then
      raise exception 'Caller não tem acesso à equipe do cliente alvo.';
    end if;
  end if;

  v_cur_cfg := coalesce(
    (select p.configuracao_tema from public.perfis p where p.usuario_id = p_usuario_id),
    '{}'::jsonb
  );
  v_cur_perfil := coalesce(v_cur_cfg->'clientePerfil', '{}'::jsonb);
  v_next_perfil := v_cur_perfil || coalesce(p_cliente_perfil_patch, '{}'::jsonb);
  v_next_cfg := v_cur_cfg || jsonb_build_object('clientePerfil', v_next_perfil);

  update public.perfis p set
    nome_completo = coalesce(nullif(trim(p_nome_completo), ''), p.nome_completo),
    email = case
              when p_email is not null and length(trim(p_email)) > 0
                then lower(trim(p_email))
              else p.email
            end,
    cpf = case
            when p_cpf is not null and length(trim(p_cpf)) > 0
              then trim(p_cpf)
            else p.cpf
          end,
    data_nascimento = case
                        when p_data_nascimento is not null then p_data_nascimento
                        else p.data_nascimento
                      end,
    endereco = case
                 when p_endereco is not null then nullif(trim(p_endereco), '')
                 else p.endereco
               end,
    equipe_id = case
                  when p.equipe_id is null and p_equipe_id is not null then p_equipe_id
                  else p.equipe_id
                end,
    configuracao_tema = v_next_cfg
  where p.usuario_id = p_usuario_id;
end;
$func$;

comment on function public.cs_import_aplicar_cliente_perfil(uuid, text, text, text, date, text, uuid, jsonb) is
  'Import JSON: atualiza scalars + merge de configuracao_tema.clientePerfil como SECURITY DEFINER; valida escopo do caller.';

revoke all on function public.cs_import_aplicar_cliente_perfil(uuid, text, text, text, date, text, uuid, jsonb) from public;
grant execute on function public.cs_import_aplicar_cliente_perfil(uuid, text, text, text, date, text, uuid, jsonb) to authenticated;
