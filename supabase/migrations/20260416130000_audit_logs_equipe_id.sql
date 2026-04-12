-- =============================================================================
-- audit_logs: adiciona equipe_id para filtro directo por tenant.
--
-- Sem equipe_id, listar logs por equipe exigiria JOIN com perfis a cada query
-- (N+1 / overhead). Com equipe_id desnormalizado, a filtragem é um WHERE directo.
-- O valor é preenchido automaticamente pelo trigger/função de escrita.
-- =============================================================================

alter table public.audit_logs
  add column if not exists equipe_id uuid references public.equipes (id) on delete set null;

comment on column public.audit_logs.equipe_id
  is 'Equipe (tenant) do user_id no momento da ação — desnormalizado para filtragem eficiente.';

create index if not exists idx_audit_logs_equipe_id
  on public.audit_logs (equipe_id);

create index if not exists idx_audit_logs_equipe_created
  on public.audit_logs (equipe_id, created_at desc);

-- -------------------------------------------------------------------------
-- Actualizar audit_log_write para resolver equipe_id a partir de perfis
-- -------------------------------------------------------------------------

create or replace function public.audit_log_write(
  p_user_id  uuid,
  p_acao     text,
  p_tabela   text,
  p_antes    jsonb default null,
  p_depois   jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_equipe uuid;
begin
  if p_user_id is not null then
    select p.equipe_id into v_equipe
    from public.perfis p
    where p.usuario_id = p_user_id
    limit 1;
  end if;

  insert into public.audit_logs (user_id, acao, tabela, antes, depois, equipe_id)
  values (p_user_id, p_acao, p_tabela, p_antes, p_depois, v_equipe)
  returning id into v_id;

  return v_id;
end;
$$;

-- -------------------------------------------------------------------------
-- RLS: admin de equipe vê logs do seu tenant (complementa a política existente)
-- -------------------------------------------------------------------------

drop policy if exists audit_logs_select_team_admin on public.audit_logs;
create policy audit_logs_select_team_admin on public.audit_logs
  for select
  to authenticated
  using (
    equipe_id is not null
    and exists (
      select 1
      from public.perfis p
      where p.usuario_id = auth.uid()
        and p.role = 'admin'
        and p.equipe_id is not null
        and p.equipe_id = audit_logs.equipe_id
    )
  );
