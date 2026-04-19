-- Import JSON (manager): resolver auth.users.id por e-mail quando o login já existe
-- mas `signUp` falha — o cliente não tem `service_role` para ler auth.users.
--
-- Implementação em LANGUAGE sql (sem variáveis PL/pgSQL) para evitar erros ao colar
-- só parte do script no SQL Editor ("relation uid does not exist").

create or replace function public.cs_import_auth_user_id_para_staff(p_email text)
returns uuid
language sql
stable
security definer
set search_path = auth, public
as $$
  select u.id
  from auth.users u
  where lower(u.email) = lower(trim(p_email))
    and auth.uid() is not null
    and exists (
      select 1
      from public.perfis me
      where me.usuario_id = auth.uid()
        and me.role in ('cs', 'admin_equipe', 'admin', 'admin_master')
    )
  limit 1;
$$;

comment on function public.cs_import_auth_user_id_para_staff(text) is
  'Staff operacional: devolve auth.users.id para o e-mail (import JSON quando signUp duplicado).';

revoke all on function public.cs_import_auth_user_id_para_staff(text) from public;
grant execute on function public.cs_import_auth_user_id_para_staff(text) to authenticated;
