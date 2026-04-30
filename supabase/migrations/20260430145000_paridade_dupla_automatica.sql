-- =============================================================================
-- Fase 3 — Paridade automática da dupla.
--
-- Objetivo: sempre que `equipe_clientes` recebe ou muda gestor_nacional_id /
-- gestor_internacional_id, sincronizar automaticamente `cliente_gestores` para
-- ter EXATAMENTE os 2 gestores da dupla atual (e nada além disso).
--
-- Também limpa 2 linhas órfãs em equipe_clientes apontando para perfis que
-- deixaram de ser 'cliente_gestao' na Fase 2 (perfis-lixo migrados para 'cliente').
--
-- Idempotente.
-- =============================================================================

-- 1) Limpeza: remover linhas em equipe_clientes que apontam para perfis que não
--    são mais 'cliente_gestao' (incluindo os 5 lixos da Fase 2 que viraram 'cliente').
delete from public.equipe_clientes ec
where exists (
  select 1 from public.perfis p
  where p.usuario_id = ec.cliente_id
    and (p.role is null or p.role <> 'cliente_gestao')
);

-- 2) Função utilitária: recria vínculos em cliente_gestores baseado na dupla
--    atual da linha de equipe_clientes. Usa SECURITY DEFINER porque RLS de
--    cliente_gestores bloqueia operadores que não são admin/gestor.
create or replace function public.sync_cliente_gestores_para_dupla(p_cliente_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gn uuid;
  v_gi uuid;
begin
  select ec.gestor_nacional_id, ec.gestor_internacional_id
    into v_gn, v_gi
  from public.equipe_clientes ec
  where ec.cliente_id = p_cliente_id;

  -- Apaga vínculos com gestores que não pertencem mais à dupla atual.
  delete from public.cliente_gestores cg
  where cg.cliente_id = p_cliente_id
    and cg.gestor_id is distinct from v_gn
    and cg.gestor_id is distinct from v_gi;

  if v_gn is not null then
    insert into public.cliente_gestores (cliente_id, gestor_id)
    values (p_cliente_id, v_gn)
    on conflict (cliente_id, gestor_id) do nothing;
  end if;

  if v_gi is not null and v_gi is distinct from v_gn then
    insert into public.cliente_gestores (cliente_id, gestor_id)
    values (p_cliente_id, v_gi)
    on conflict (cliente_id, gestor_id) do nothing;
  end if;
end;
$$;

comment on function public.sync_cliente_gestores_para_dupla(uuid) is
  'Garante que cliente_gestores reflita os 2 gestores atuais (nacional + internacional) da dupla em equipe_clientes. Apaga vínculos extras. Veja migration 20260430145000.';

grant execute on function public.sync_cliente_gestores_para_dupla(uuid) to authenticated;

-- 3) Trigger AFTER INSERT/UPDATE em equipe_clientes: dispara o sync.
create or replace function public.trg_equipe_clientes_sync_dupla()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT'
     or new.gestor_nacional_id is distinct from old.gestor_nacional_id
     or new.gestor_internacional_id is distinct from old.gestor_internacional_id
     or new.cliente_id is distinct from old.cliente_id then
    perform public.sync_cliente_gestores_para_dupla(new.cliente_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_equipe_clientes_sync_dupla on public.equipe_clientes;
create trigger trg_equipe_clientes_sync_dupla
after insert or update on public.equipe_clientes
for each row execute function public.trg_equipe_clientes_sync_dupla();

-- 4) Trigger AFTER DELETE em equipe_clientes: limpa cliente_gestores do cliente.
create or replace function public.trg_equipe_clientes_cleanup_dupla()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.cliente_gestores cg
  where cg.cliente_id = old.cliente_id
    and cg.gestor_id in (
      coalesce(old.gestor_nacional_id, '00000000-0000-0000-0000-000000000000'::uuid),
      coalesce(old.gestor_internacional_id, '00000000-0000-0000-0000-000000000000'::uuid)
    );
  return old;
end;
$$;

drop trigger if exists trg_equipe_clientes_cleanup_dupla on public.equipe_clientes;
create trigger trg_equipe_clientes_cleanup_dupla
after delete on public.equipe_clientes
for each row execute function public.trg_equipe_clientes_cleanup_dupla();
