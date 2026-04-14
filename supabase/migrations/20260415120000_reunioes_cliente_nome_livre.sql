-- Permite associar reunião a um cliente sem conta (apenas texto), além de cliente_id (auth.users).

alter table public.reunioes_onboarding
  add column if not exists cliente_nome_livre text null;

comment on column public.reunioes_onboarding.cliente_nome_livre is
  'Nome exibido quando não há cliente_id vinculado (cliente fora da base ou prospect).';
