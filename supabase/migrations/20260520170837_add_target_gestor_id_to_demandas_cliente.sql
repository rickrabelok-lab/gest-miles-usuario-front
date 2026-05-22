alter table public.demandas_cliente
  add column if not exists target_gestor_id uuid;

create index if not exists demandas_cliente_target_gestor_id_idx
  on public.demandas_cliente (target_gestor_id)
  where target_gestor_id is not null;

comment on column public.demandas_cliente.target_gestor_id is
  'Gestor alvo para demandas criadas por CS/Admin Equipe quando a demanda ainda nao esta vinculada a um cliente.';
