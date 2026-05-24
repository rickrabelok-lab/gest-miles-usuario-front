begin;

alter table public.subscriptions
  add column if not exists motivo_churn text;

comment on column public.subscriptions.motivo_churn is
  'Motivo de churn/inativacao usado pelo dashboard admin. Draft seguro: aplicar somente com envelope sensivel aprovado.';

create or replace function public.admin_update_subscription_churn_reason(
  p_subscription_id uuid,
  p_motivo_churn text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_actor_equipe_id uuid;
  v_subscription_equipe_id uuid;
begin
  if v_actor is null then
    raise exception 'admin_subscription_unauthenticated' using errcode = '42501';
  end if;

  select lower(trim(coalesce(p.role::text, ''))), p.equipe_id
    into v_actor_role, v_actor_equipe_id
  from public.perfis p
  where p.usuario_id = v_actor;

  if v_actor_role is null or v_actor_role not in ('admin_master', 'admin', 'admin_geral', 'admin_equipe') then
    raise exception 'admin_subscription_forbidden' using errcode = '42501';
  end if;

  select s.equipe_id
    into v_subscription_equipe_id
  from public.subscriptions s
  where s.id = p_subscription_id
  for update;

  if not found then
    raise exception 'admin_subscription_not_found' using errcode = '02000';
  end if;

  if v_actor_role in ('admin_equipe')
     or (v_actor_role = 'admin' and v_actor_equipe_id is not null) then
    if v_actor_equipe_id is null
       or v_subscription_equipe_id is null
       or v_subscription_equipe_id is distinct from v_actor_equipe_id then
      raise exception 'admin_subscription_cross_team_forbidden' using errcode = '42501';
    end if;
  end if;

  update public.subscriptions
     set motivo_churn = nullif(trim(coalesce(p_motivo_churn, '')), ''),
         updated_at = now()
   where id = p_subscription_id;
end;
$$;

revoke all on function public.admin_update_subscription_churn_reason(uuid, text) from public, anon;
grant execute on function public.admin_update_subscription_churn_reason(uuid, text) to authenticated, service_role;

commit;
