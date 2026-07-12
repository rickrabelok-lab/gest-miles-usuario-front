-- Materializa o slug do programa em promo_alerts (source/target_program_id), via
-- trigger que lê program_aliases. Aposenta a duplicação alias front-TS × DB:
-- o front passa a ler o slug pronto. program_aliases (DB) vira a fonte única.
-- NÃO aplicar aqui: rollout com OK do owner (banco compartilhado).
-- Rollback: drop trigger trg_promo_alerts_set_program_ids on public.promo_alerts;
--           drop function public.promo_alerts_set_program_ids();
--           alter table public.promo_alerts drop column source_program_id, drop column target_program_id;
alter table public.promo_alerts add column if not exists source_program_id text;
alter table public.promo_alerts add column if not exists target_program_id text;

create or replace function public.promo_alerts_set_program_ids()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.source_program_id := (
    select program_id from public.program_aliases where alias_norm = public.promo_norm(new.source_program)
  );
  new.target_program_id := (
    select program_id from public.program_aliases where alias_norm = public.promo_norm(new.target_program)
  );
  return new;
end;
$$;

drop trigger if exists trg_promo_alerts_set_program_ids on public.promo_alerts;
create trigger trg_promo_alerts_set_program_ids
  before insert or update of source_program, target_program on public.promo_alerts
  for each row execute function public.promo_alerts_set_program_ids();

-- backfill dos existentes (direto; a coluna atualizada não é source_program, então não redispara o trigger)
update public.promo_alerts pa set
  source_program_id = (select program_id from public.program_aliases where alias_norm = public.promo_norm(pa.source_program)),
  target_program_id = (select program_id from public.program_aliases where alias_norm = public.promo_norm(pa.target_program));
