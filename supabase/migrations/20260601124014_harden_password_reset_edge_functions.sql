-- Hardening local para Edge Functions de reset de senha.
-- Nao aplicar sem deploy coordenado: request-password-reset passa a chamar check_password_reset_rate_limit.

create table if not exists public.password_reset_rate_limits (
  id bigint generated always as identity primary key,
  email_hash text not null,
  ip_hash text not null,
  created_at timestamptz not null default now(),
  constraint password_reset_rate_limits_email_hash_chk check (email_hash ~ '^[0-9a-f]{64}$'),
  constraint password_reset_rate_limits_ip_hash_chk check (ip_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists idx_password_reset_rate_limits_email_created
  on public.password_reset_rate_limits (email_hash, created_at desc);

create index if not exists idx_password_reset_rate_limits_ip_created
  on public.password_reset_rate_limits (ip_hash, created_at desc);

alter table public.password_reset_rate_limits enable row level security;

revoke all on table public.password_reset_rate_limits from public, anon, authenticated;
revoke all on sequence public.password_reset_rate_limits_id_seq from public, anon, authenticated;

create or replace function public.check_password_reset_rate_limit(
  p_email_hash text,
  p_ip_hash text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email_count integer;
  v_ip_count integer;
begin
  if p_email_hash !~ '^[0-9a-f]{64}$' or p_ip_hash !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  delete from public.password_reset_rate_limits
  where created_at < now() - interval '24 hours';

  insert into public.password_reset_rate_limits (email_hash, ip_hash)
  values (p_email_hash, p_ip_hash);

  select count(*) into v_email_count
  from public.password_reset_rate_limits
  where email_hash = p_email_hash
    and created_at >= now() - interval '1 hour';

  select count(*) into v_ip_count
  from public.password_reset_rate_limits
  where ip_hash = p_ip_hash
    and created_at >= now() - interval '1 hour';

  return v_email_count <= 3 and v_ip_count <= 20;
end;
$$;

revoke all on function public.check_password_reset_rate_limit(text, text) from public, anon, authenticated;
grant execute on function public.check_password_reset_rate_limit(text, text) to service_role;
