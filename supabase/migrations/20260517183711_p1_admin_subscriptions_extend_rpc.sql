begin;

create or replace function public.admin_extend_subscription_by_days(
  p_subscription_id uuid,
  p_days integer
)
returns table(subscription_id uuid, end_column text, ends_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_actor_equipe_id uuid;
  v_row public.subscriptions%rowtype;
  v_end_column text;
  v_current_end timestamptz;
  v_base timestamptz;
  v_next timestamptz;
begin
  if v_actor is null then
    raise exception 'admin_subscription_unauthenticated' using errcode = '42501';
  end if;

  if p_subscription_id is null or p_days is null or p_days <= 0 or p_days > 3660 then
    raise exception 'admin_subscription_invalid_input' using errcode = '23514';
  end if;

  select lower(trim(coalesce(p.role::text, ''))), p.equipe_id
    into v_actor_role, v_actor_equipe_id
  from public.perfis p
  where p.usuario_id = v_actor;

  if v_actor_role is null or v_actor_role not in ('admin_master', 'admin', 'admin_geral') then
    raise exception 'admin_subscription_forbidden' using errcode = '42501';
  end if;

  if v_actor_role = 'admin' and v_actor_equipe_id is not null then
    raise exception 'admin_subscription_global_admin_required' using errcode = '42501';
  end if;

  select *
    into v_row
  from public.subscriptions s
  where s.id = p_subscription_id
  for update;

  if not found then
    raise exception 'admin_subscription_not_found' using errcode = '02000';
  end if;

  v_end_column := case
    when v_row.expires_at is not null then 'expires_at'
    when v_row.end_at is not null then 'end_at'
    when v_row.current_period_end is not null then 'current_period_end'
    when v_row.valid_until is not null then 'valid_until'
    when v_row.data_fim is not null then 'data_fim'
    else 'expires_at'
  end;

  v_current_end := coalesce(v_row.expires_at, v_row.end_at, v_row.current_period_end, v_row.valid_until, v_row.data_fim);
  v_base := greatest(coalesce(v_current_end, now()), now());
  v_next := v_base + make_interval(days => p_days);

  execute format('update public.subscriptions set %I = $1, updated_at = now() where id = $2', v_end_column)
    using v_next, p_subscription_id;

  if to_regclass('public.logs_acoes') is not null then
    insert into public.logs_acoes(user_id, tipo_acao, entidade_afetada, entidade_id, details)
    values (
      v_actor,
      'admin_subscription.extend_days',
      'subscriptions',
      p_subscription_id::text,
      jsonb_build_object(
        'days', p_days,
        'end_column', v_end_column,
        'previous_end', v_current_end,
        'next_end', v_next
      )
    );
  end if;

  return query select p_subscription_id, v_end_column, v_next;
end;
$$;

revoke all on function public.admin_extend_subscription_by_days(uuid, integer) from public, anon;
grant execute on function public.admin_extend_subscription_by_days(uuid, integer) to authenticated, service_role;

commit;
