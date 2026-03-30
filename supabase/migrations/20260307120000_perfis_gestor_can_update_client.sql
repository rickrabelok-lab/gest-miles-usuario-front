-- Permite que o gestor atualize (e crie) o perfil dos clientes que ele gerencia.
-- No Supabase: SQL Editor > New query > Cole este arquivo inteiro > Run.

-- 1) Garantir que a função exista
create or replace function public.can_manage_client(target_cliente_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(
      auth.uid() = target_cliente_id
      or public.is_admin()
      or exists (
        select 1
        from public.gestor_clientes gc
        where gc.gestor_id = auth.uid()
          and gc.cliente_id = target_cliente_id
      ),
      false
    );
$$;

-- 2) Remover policy antiga de UPDATE e criar nova
drop policy if exists perfis_update_own_or_admin on public.perfis;
drop policy if exists perfis_update_own_or_gestor_or_admin on public.perfis;

create policy perfis_update_own_or_gestor_or_admin on public.perfis
  for update
  using (
    auth.uid() = usuario_id
    or public.is_admin()
    or public.can_manage_client(usuario_id)
  )
  with check (
    auth.uid() = usuario_id
    or public.is_admin()
    or public.can_manage_client(usuario_id)
  );

-- 3) Remover policy antiga de INSERT e criar nova
drop policy if exists perfis_insert_own on public.perfis;
drop policy if exists perfis_insert_own_or_gestor on public.perfis;

create policy perfis_insert_own_or_gestor on public.perfis
  for insert
  with check (
    auth.uid() = usuario_id
    or public.can_manage_client(usuario_id)
  );
