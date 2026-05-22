-- Admin config singletons for Feature Flags, Planos and Security.
create extension if not exists "pgcrypto" with schema extensions;

create or replace function public.is_admin_config_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis p where p.usuario_id = auth.uid() and (lower(trim(coalesce(p.role, ''))) = 'admin_master' or (lower(trim(coalesce(p.role, ''))) = 'admin' and (p.equipe_id is null or trim(p.equipe_id::text) = ''))));
$$;
create or replace function public.is_admin_security_config_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis p where p.usuario_id = auth.uid() and lower(trim(coalesce(p.role, ''))) = 'admin_master');
$$;
create or replace function public.set_admin_config_updated_at()
returns trigger language plpgsql set search_path = public as $$ begin new.updated_at = now(); return new; end; $$;

create table if not exists public.admin_feature_flags (id uuid primary key default gen_random_uuid(), config_key text not null default 'default', payload jsonb not null, updated_by uuid null references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), constraint admin_feature_flags_singleton_key check (config_key = 'default'), constraint admin_feature_flags_config_key_unique unique (config_key));
create table if not exists public.admin_planos_config (id uuid primary key default gen_random_uuid(), config_key text not null default 'default', payload jsonb not null, updated_by uuid null references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), constraint admin_planos_config_singleton_key check (config_key = 'default'), constraint admin_planos_config_config_key_unique unique (config_key));
create table if not exists public.admin_security_config (id uuid primary key default gen_random_uuid(), config_key text not null default 'default', payload jsonb not null, updated_by uuid null references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), constraint admin_security_config_singleton_key check (config_key = 'default'), constraint admin_security_config_config_key_unique unique (config_key));

-- Upgrade legacy/empty tables that may already exist without singleton metadata.
alter table public.admin_feature_flags add column if not exists config_key text not null default 'default';
alter table public.admin_feature_flags add column if not exists created_at timestamptz not null default now();
alter table public.admin_feature_flags add column if not exists updated_by uuid null references auth.users(id) on delete set null;
alter table public.admin_planos_config add column if not exists config_key text not null default 'default';
alter table public.admin_planos_config add column if not exists created_at timestamptz not null default now();
alter table public.admin_planos_config add column if not exists updated_by uuid null references auth.users(id) on delete set null;
alter table public.admin_security_config add column if not exists config_key text not null default 'default';
alter table public.admin_security_config add column if not exists created_at timestamptz not null default now();
alter table public.admin_security_config add column if not exists updated_by uuid null references auth.users(id) on delete set null;

create unique index if not exists admin_feature_flags_config_key_unique_idx on public.admin_feature_flags (config_key);
create unique index if not exists admin_planos_config_config_key_unique_idx on public.admin_planos_config (config_key);
create unique index if not exists admin_security_config_config_key_unique_idx on public.admin_security_config (config_key);

drop trigger if exists set_admin_feature_flags_updated_at on public.admin_feature_flags;
create trigger set_admin_feature_flags_updated_at before update on public.admin_feature_flags for each row execute function public.set_admin_config_updated_at();
drop trigger if exists set_admin_planos_config_updated_at on public.admin_planos_config;
create trigger set_admin_planos_config_updated_at before update on public.admin_planos_config for each row execute function public.set_admin_config_updated_at();
drop trigger if exists set_admin_security_config_updated_at on public.admin_security_config;
create trigger set_admin_security_config_updated_at before update on public.admin_security_config for each row execute function public.set_admin_config_updated_at();

alter table public.admin_feature_flags enable row level security;
alter table public.admin_planos_config enable row level security;
alter table public.admin_security_config enable row level security;
revoke all on public.admin_feature_flags from public, anon;
revoke all on public.admin_planos_config from public, anon;
revoke all on public.admin_security_config from public, anon;
grant select, insert, update on public.admin_feature_flags to authenticated;
grant select, insert, update on public.admin_planos_config to authenticated;
grant select, insert, update on public.admin_security_config to authenticated;

drop policy if exists admin_feature_flags_master_all on public.admin_feature_flags;
drop policy if exists admin_planos_config_master_all on public.admin_planos_config;
drop policy if exists admin_security_config_master_all on public.admin_security_config;

drop policy if exists "admin_feature_flags_select_platform_admin" on public.admin_feature_flags;
create policy "admin_feature_flags_select_platform_admin" on public.admin_feature_flags for select to authenticated using (public.is_admin_config_manager());
drop policy if exists "admin_feature_flags_insert_platform_admin" on public.admin_feature_flags;
create policy "admin_feature_flags_insert_platform_admin" on public.admin_feature_flags for insert to authenticated with check (public.is_admin_config_manager());
drop policy if exists "admin_feature_flags_update_platform_admin" on public.admin_feature_flags;
create policy "admin_feature_flags_update_platform_admin" on public.admin_feature_flags for update to authenticated using (public.is_admin_config_manager()) with check (public.is_admin_config_manager());

drop policy if exists "admin_planos_config_select_platform_admin" on public.admin_planos_config;
create policy "admin_planos_config_select_platform_admin" on public.admin_planos_config for select to authenticated using (public.is_admin_config_manager());
drop policy if exists "admin_planos_config_insert_platform_admin" on public.admin_planos_config;
create policy "admin_planos_config_insert_platform_admin" on public.admin_planos_config for insert to authenticated with check (public.is_admin_config_manager());
drop policy if exists "admin_planos_config_update_platform_admin" on public.admin_planos_config;
create policy "admin_planos_config_update_platform_admin" on public.admin_planos_config for update to authenticated using (public.is_admin_config_manager()) with check (public.is_admin_config_manager());

drop policy if exists "admin_security_config_select_admin_master" on public.admin_security_config;
create policy "admin_security_config_select_admin_master" on public.admin_security_config for select to authenticated using (public.is_admin_security_config_manager());
drop policy if exists "admin_security_config_insert_admin_master" on public.admin_security_config;
create policy "admin_security_config_insert_admin_master" on public.admin_security_config for insert to authenticated with check (public.is_admin_security_config_manager());
drop policy if exists "admin_security_config_update_admin_master" on public.admin_security_config;
create policy "admin_security_config_update_admin_master" on public.admin_security_config for update to authenticated using (public.is_admin_security_config_manager()) with check (public.is_admin_security_config_manager());
