-- Phase B: close legacy direct configuracoes table access after Phase A deploy + smoke.
-- This migration revokes direct table grants and replaces legacy permissive policies with admin-only policies.
-- Local migration draft only. Do not apply without explicit Rick approval per project_ref.

create or replace function public.is_admin_global_or_master()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.perfis p
    where p.usuario_id = auth.uid()
      and (
        lower(trim(coalesce(p.role, ''))) = 'admin_master'
        or (
          lower(trim(coalesce(p.role, ''))) = 'admin'
          and (p.equipe_id is null or trim(p.equipe_id::text) = '')
        )
      )
  );
$$;

alter table public.configuracoes enable row level security;
alter table public.configuracoes_historico enable row level security;

-- Phase B: close legacy direct table access after Phase A deploy + smoke confirm all clients use RPCs.
revoke all on public.configuracoes from public, anon;
revoke all on public.configuracoes_historico from public, anon;
revoke all on public.configuracoes from authenticated;
revoke all on public.configuracoes_historico from authenticated;

drop policy if exists configuracoes_select_auth on public.configuracoes;
drop policy if exists configuracoes_select_anon on public.configuracoes;
drop policy if exists configuracoes_write_admin on public.configuracoes;
drop policy if exists configuracoes_admin_select on public.configuracoes;
drop policy if exists configuracoes_admin_write on public.configuracoes;

create policy configuracoes_admin_select
on public.configuracoes
for select
to authenticated
using (public.is_admin_global_or_master());

create policy configuracoes_admin_write
on public.configuracoes
for all
to authenticated
using (public.is_admin_global_or_master())
with check (public.is_admin_global_or_master());

drop policy if exists configuracoes_historico_select_admin on public.configuracoes_historico;
drop policy if exists configuracoes_historico_admin_select on public.configuracoes_historico;

create policy configuracoes_historico_admin_select
on public.configuracoes_historico
for select
to authenticated
using (public.is_admin_global_or_master());
