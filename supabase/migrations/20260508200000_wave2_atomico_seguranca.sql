-- Wave 2: admin_security_config, admin_ip_blocks, contratos columns,
--         salvar_perfil_cliente_atomico, agendar_reuniao_com_participantes

begin;

-- ── Admin: configuração de segurança ─────────────────────────────────────
create table if not exists public.admin_security_config (
  id         uuid primary key default gen_random_uuid(),
  payload    jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.admin_security_config enable row level security;

drop policy if exists "admin_security_config_master_all" on public.admin_security_config;
create policy "admin_security_config_master_all"
  on public.admin_security_config
  for all
  using (
    exists (
      select 1 from public.perfis
      where usuario_id = auth.uid() and role = 'master'
    )
  );

-- ── Admin: bloqueios de IP ────────────────────────────────────────────────
create table if not exists public.admin_ip_blocks (
  id           uuid primary key default gen_random_uuid(),
  ip           text not null,
  motivo       text not null check (motivo in ('forca_bruta', 'manual', 'suspeito')),
  bloqueado_em timestamptz not null default now(),
  expira_em    timestamptz,
  bloqueado_por text,
  ativo        boolean not null default true
);

alter table public.admin_ip_blocks enable row level security;

drop policy if exists "admin_ip_blocks_master_all" on public.admin_ip_blocks;
create policy "admin_ip_blocks_master_all"
  on public.admin_ip_blocks
  for all
  using (
    exists (
      select 1 from public.perfis
      where usuario_id = auth.uid() and role = 'master'
    )
  );

-- ── contratos_cliente: colunas faltantes ─────────────────────────────────
alter table public.contratos_cliente
  add column if not exists motivo_inativacao  text,
  add column if not exists data_inativacao    date,
  add column if not exists renovado_por_meses integer;

-- ── RPC: salvar perfil do cliente atomicamente ───────────────────────────
create or replace function public.salvar_perfil_cliente_atomico(
  p_usuario_id              uuid,
  p_nome_completo           text,
  p_configuracao_tema       jsonb,
  p_email                   text,
  p_gestor_nacional_id      uuid,
  p_gestor_internacional_id uuid,
  p_equipe_id               uuid,
  p_equipe_gestor_ids       uuid[]
)
returns void
language plpgsql
security definer
as $$
begin
  update public.perfis
  set
    nome_completo     = p_nome_completo,
    configuracao_tema = p_configuracao_tema,
    email             = p_email
  where usuario_id = p_usuario_id;

  if not found then
    raise exception 'Perfil não encontrado para usuario_id %', p_usuario_id;
  end if;

  -- Remove vínculos anteriores do cliente com gestores da equipe
  if p_equipe_gestor_ids is not null and array_length(p_equipe_gestor_ids, 1) > 0 then
    delete from public.cliente_gestores
    where
      cliente_id = p_usuario_id
      and gestor_id = any(p_equipe_gestor_ids);
  end if;

  -- Insere novos vínculos (nacional, ignorando nulo)
  if p_gestor_nacional_id is not null then
    insert into public.cliente_gestores (cliente_id, gestor_id)
    values (p_usuario_id, p_gestor_nacional_id)
    on conflict (cliente_id, gestor_id) do nothing;
  end if;

  -- Insere vínculo internacional se diferente do nacional
  if p_gestor_internacional_id is not null
     and p_gestor_internacional_id is distinct from p_gestor_nacional_id then
    insert into public.cliente_gestores (cliente_id, gestor_id)
    values (p_usuario_id, p_gestor_internacional_id)
    on conflict (cliente_id, gestor_id) do nothing;
  end if;

  -- Upsert em equipe_clientes
  if p_equipe_id is not null then
    insert into public.equipe_clientes
      (equipe_id, cliente_id, gestor_nacional_id, gestor_internacional_id, ativo)
    values
      (p_equipe_id, p_usuario_id, p_gestor_nacional_id, p_gestor_internacional_id, true)
    on conflict (cliente_id) do update set
      gestor_nacional_id      = excluded.gestor_nacional_id,
      gestor_internacional_id = excluded.gestor_internacional_id,
      ativo                   = true;
  end if;
end;
$$;

grant execute on function public.salvar_perfil_cliente_atomico to authenticated;

-- ── RPC: agendar reunião com participantes atomicamente ───────────────────
create or replace function public.agendar_reuniao_com_participantes(
  p_titulo             text,
  p_descricao          text,
  p_starts_at          timestamptz,
  p_created_by         uuid,
  p_equipe_id          uuid,
  p_cliente_id         uuid,
  p_cliente_nome_livre text,
  p_participante_ids   uuid[]
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_reuniao_id uuid;
begin
  insert into public.reunioes_onboarding (
    titulo, descricao, starts_at, created_by, equipe_id, cliente_id, cliente_nome_livre
  ) values (
    p_titulo, p_descricao, p_starts_at, p_created_by, p_equipe_id, p_cliente_id, p_cliente_nome_livre
  )
  returning id into v_reuniao_id;

  if p_participante_ids is not null and array_length(p_participante_ids, 1) > 0 then
    insert into public.reunioes_onboarding_participantes (reuniao_id, usuario_id)
    select v_reuniao_id, unnest(p_participante_ids)
    on conflict do nothing;
  end if;

  return v_reuniao_id;
end;
$$;

grant execute on function public.agendar_reuniao_com_participantes to authenticated;

commit;
