-- Atomic update/delete RPCs for onboarding meetings.
-- Keeps browser writes from doing multi-step participant replacement directly.

create or replace function public.atualizar_reuniao_onboarding_com_participantes(
  p_reuniao_id uuid,
  p_titulo text,
  p_descricao text,
  p_starts_at timestamptz,
  p_cliente_id uuid,
  p_cliente_nome_livre text,
  p_participante_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_equipe_id uuid;
  v_created_by uuid;
begin
  if auth.uid() is null then
    raise exception 'Sessão inválida.'
      using errcode = '42501';
  end if;

  select r.equipe_id, r.created_by
    into v_equipe_id, v_created_by
  from public.reunioes_onboarding r
  where r.id = p_reuniao_id;

  if not found then
    raise exception 'Reunião não encontrada.'
      using errcode = 'P0002';
  end if;

  if not (
    public.is_admin()
    or v_created_by = auth.uid()
    or public.can_access_equipe(v_equipe_id)
  ) then
    raise exception 'Sem permissão para atualizar esta reunião.'
      using errcode = '42501';
  end if;

  update public.reunioes_onboarding
     set titulo = p_titulo,
         descricao = p_descricao,
         starts_at = p_starts_at,
         cliente_id = p_cliente_id,
         cliente_nome_livre = p_cliente_nome_livre
   where id = p_reuniao_id;

  delete from public.reunioes_onboarding_participantes
   where reuniao_id = p_reuniao_id;

  if p_participante_ids is not null and array_length(p_participante_ids, 1) > 0 then
    insert into public.reunioes_onboarding_participantes (reuniao_id, usuario_id)
    select p_reuniao_id, unnest(p_participante_ids)
    on conflict do nothing;
  end if;
end;
$$;

revoke all on function public.atualizar_reuniao_onboarding_com_participantes(
  uuid, text, text, timestamptz, uuid, text, uuid[]
) from public, anon;

grant execute on function public.atualizar_reuniao_onboarding_com_participantes(
  uuid, text, text, timestamptz, uuid, text, uuid[]
) to authenticated, service_role;

create or replace function public.excluir_reuniao_onboarding(
  p_reuniao_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_equipe_id uuid;
  v_created_by uuid;
begin
  if auth.uid() is null then
    raise exception 'Sessão inválida.'
      using errcode = '42501';
  end if;

  select r.equipe_id, r.created_by
    into v_equipe_id, v_created_by
  from public.reunioes_onboarding r
  where r.id = p_reuniao_id;

  if not found then
    raise exception 'Reunião não encontrada.'
      using errcode = 'P0002';
  end if;

  if not (
    public.is_admin()
    or v_created_by = auth.uid()
    or public.can_access_equipe(v_equipe_id)
  ) then
    raise exception 'Sem permissão para excluir esta reunião.'
      using errcode = '42501';
  end if;

  delete from public.reunioes_onboarding
   where id = p_reuniao_id;
end;
$$;

revoke all on function public.excluir_reuniao_onboarding(uuid) from public, anon;

grant execute on function public.excluir_reuniao_onboarding(uuid) to authenticated, service_role;

comment on function public.atualizar_reuniao_onboarding_com_participantes(
  uuid, text, text, timestamptz, uuid, text, uuid[]
) is 'Atualiza reuniao onboarding e troca participantes de forma atomica com validacao de permissao.';

comment on function public.excluir_reuniao_onboarding(uuid) is
  'Exclui reuniao onboarding com validacao de permissao.';
