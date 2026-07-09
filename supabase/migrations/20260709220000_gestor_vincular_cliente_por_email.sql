-- Vincular cliente à carteira do gestor POR E-MAIL (substitui o fluxo de colar UUID
-- copiado do menu ☰ do app do cliente — o cartão "ID da sua conta" sai do app).
--
-- Wrapper fino: resolve e-mail -> usuario_id (perfis.email; fallback auth.users pra
-- perfil com email desatualizado/nulo) e delega TODA a autorização a
-- public.gestor_vincular_cliente(uuid) — guards de role/equipe ficam num lugar só.
-- Retorna o resultado do vínculo + cliente_id (o manager navega pro cliente depois).

create or replace function public.gestor_vincular_cliente_por_email(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_cliente_id uuid;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'gestor_vincular_cliente_unauthenticated' using errcode = '42501';
  end if;

  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'gestor_vincular_cliente_invalid_input' using errcode = '23514';
  end if;

  select p.usuario_id
    into v_cliente_id
    from public.perfis p
   where lower(trim(coalesce(p.email, ''))) = v_email
     and lower(trim(coalesce(p.role::text, ''))) in ('cliente', 'cliente_gestao')
   limit 1;

  if v_cliente_id is null then
    select p.usuario_id
      into v_cliente_id
      from auth.users u
      join public.perfis p on p.usuario_id = u.id
     where lower(coalesce(u.email, '')) = v_email
       and lower(trim(coalesce(p.role::text, ''))) in ('cliente', 'cliente_gestao')
     limit 1;
  end if;

  if v_cliente_id is null then
    -- mesmo errcode do fluxo por ID: o front traduz 23503 pra "não encontrado"
    raise exception 'gestor_vincular_cliente_cliente_not_found_or_without_team' using errcode = '23503';
  end if;

  v_result := public.gestor_vincular_cliente(v_cliente_id);
  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object('cliente_id', v_cliente_id);
end;
$$;

revoke all on function public.gestor_vincular_cliente_por_email(text) from public, anon;
grant execute on function public.gestor_vincular_cliente_por_email(text) to authenticated, service_role;
