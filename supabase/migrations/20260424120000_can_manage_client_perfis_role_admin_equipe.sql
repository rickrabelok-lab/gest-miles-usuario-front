-- Quem já aplicou 20260423120000: rode este ficheiro no SQL Editor (ou deixe o CLI aplicar esta migration).
--
-- Problema: `perfis.role` do painel "Admin equipe" é o literal `admin_equipe`, não `admin`.
-- O bloco "mesma equipe que o cliente" em can_manage_client só testava `role = 'admin'`,
-- pelo que utilizadores com `admin_equipe` não passavam no RLS (programas_cliente, emissões, etc.).
--
-- can_admin_equipe: reunioes_onboarding e outras policies usam só `role = 'admin'`; alinhamos.

create or replace function public.can_manage_client(target_cliente_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    auth.uid() = target_cliente_id
    or public.is_legacy_platform_admin()
    or exists (
      select 1
      from public.cliente_gestores cg
      where cg.gestor_id = auth.uid()
        and cg.cliente_id = target_cliente_id
    )
    or exists (
      select 1
      from public.perfis me
      join public.perfis c on c.equipe_id is not distinct from me.equipe_id
      where me.usuario_id = auth.uid()
        and me.role in ('admin', 'admin_equipe')
        and me.equipe_id is not null
        and c.usuario_id = target_cliente_id
        and c.equipe_id is not null
    )
    or exists (
      select 1
      from public.equipe_clientes ec
      inner join public.equipe_admin ea
        on ea.equipe_id = ec.equipe_id
        and ea.ativo = true
      where ec.cliente_id = target_cliente_id
        and ec.ativo = true
        and (
          ea.admin_equipe_id_1 = auth.uid()
          or ea.admin_equipe_id_2 = auth.uid()
          or ea.admin_equipe_id_3 = auth.uid()
        )
    ),
    false
  );
$$;

comment on function public.can_manage_client(uuid) is
  'Gestor (cliente_gestores), admin/admin_equipe na mesma equipe que o cliente (perfis), ou equipe_admin+equipe_clientes.';

create or replace function public.can_admin_equipe(target_equipe_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    exists (
      select 1
      from public.perfis p
      where p.usuario_id = auth.uid()
        and p.role in ('admin', 'admin_equipe')
        and p.equipe_id is not null
        and p.equipe_id = target_equipe_id
    ),
    false
  );
$$;
