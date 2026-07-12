-- Fase 3-B: promoção personalizada proativa (WhatsApp).
-- Cria: promo_norm() + program_aliases (cross nome->program_id), promo_alert_envios
-- (idempotência do direto), e o trigger de aprovação que dispara o webhook n8n
-- (pg_net + Vault, mesmo padrão da notificação de demanda 20260709120000).
-- NÃO aplicar aqui: rollout controlado com OK do owner (banco compartilhado).
-- Rollback: drop trigger trg_promo_aprovada_notify on public.promo_alerts;
--           drop function public.promo_aprovada_notify();
--           drop table public.promo_alert_envios; drop table public.program_aliases;
--           drop function public.promo_norm(text);
begin;

-- Normaliza nome de programa: sem acento, minúsculo, só [a-z0-9] (espelha o
-- normalizeProgramToId do front, src/lib/promo-alerts/matching.ts).
-- Usa translate() em vez de unaccent (extensão não instalada no projeto; evita
-- instalar extensão no banco COMPARTILHADO só por isso). Tudo immutable.
create or replace function public.promo_norm(p_text text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select regexp_replace(
    translate(lower(coalesce(p_text, '')),
      'áàâãäéèêëíìîïóòôõöúùûüçñ',
      'aaaaaeeeeiiiiooooouuuucn'),
    '[^a-z0-9]+', '', 'g');
$$;

-- Alias nome-normalizado -> program_id. Seed espelha a tabela ALIASES do front.
-- ⚠️ Sync front<->DB (2 lugares). Evita tokens genéricos ("all","aa","avios").
create table if not exists public.program_aliases (
  alias_norm text primary key,
  program_id text not null
);
alter table public.program_aliases enable row level security;
revoke all on public.program_aliases from anon, authenticated;

insert into public.program_aliases (alias_norm, program_id) values
  ('livelo','livelo'),
  ('esfera','esfera'),
  ('itau','itau'),('itaucard','itau'),('itaucartoes','itau'),
  ('interloop','inter-loop'),('inter','inter-loop'),('interpontos','inter-loop'),('loop','inter-loop'),
  ('atomosc6','atomos-c6'),('atomos','atomos-c6'),('c6','atomos-c6'),('c6atomos','atomos-c6'),('c6bank','atomos-c6'),
  ('amex','amex'),('americanexpress','amex'),('membershiprewards','amex'),('amexrewards','amex'),
  ('smiles','smiles'),
  ('latampass','latam-pass'),('latam','latam-pass'),
  ('tudoazul','tudo-azul'),('azul','tudo-azul'),
  ('iberia','iberia'),('iberiaplus','iberia'),
  ('tap','tap'),('tapmilesego','tap'),('milesego','tap'),
  ('allaccor','all-accor'),('accor','all-accor'),
  ('aadvantage','american-airlines'),('americanairlines','american-airlines'),
  ('copa','copa-airlines'),('copaairlines','copa-airlines'),('connectmiles','copa-airlines'),
  ('qatar','qatar-airways'),('qatarairways','qatar-airways'),
  ('britishairways','british-airways'),
  ('finnair','finnair'),('finnairplus','finnair')
on conflict (alias_norm) do update set program_id = excluded.program_id;

-- Idempotência do envio direto: (promo, cliente, canal) já enviado não reenvia.
create table if not exists public.promo_alert_envios (
  promo_id uuid not null,
  cliente_id uuid not null,
  canal text not null default 'whatsapp_direto',
  enviado_em timestamptz not null default now(),
  primary key (promo_id, cliente_id, canal)
);
alter table public.promo_alert_envios enable row level security;
revoke all on public.promo_alert_envios from anon, authenticated;

-- Trigger de aprovação: dispara webhook n8n via pg_net (best-effort, no-op sem Vault).
create or replace function public.promo_aprovada_notify()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_url text;
  v_secret text;
begin
  begin
    select decrypted_secret into v_url
      from vault.decrypted_secrets where name = 'n8n_promo_personalizado_webhook_url';
    select decrypted_secret into v_secret
      from vault.decrypted_secrets where name = 'n8n_promo_personalizado_webhook_secret';
    if v_url is null or v_secret is null then
      return new; -- infra ainda não configurada: no-op silencioso
    end if;
    perform net.http_post(
      url := v_url,
      body := jsonb_build_object('evento', 'promo_aprovada', 'promo_id', new.id),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret)
    );
  exception when others then
    -- Notificação é best-effort: NUNCA derruba o UPDATE de moderação.
    raise warning 'promo_aprovada_notify falhou (promo %): %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.promo_aprovada_notify() from public, anon, authenticated;

drop trigger if exists trg_promo_aprovada_notify on public.promo_alerts;
create trigger trg_promo_aprovada_notify
  after update of status on public.promo_alerts
  for each row
  when (new.status = 'approved' and old.status is distinct from 'approved' and new.category = 'transfer')
  execute function public.promo_aprovada_notify();

commit;
