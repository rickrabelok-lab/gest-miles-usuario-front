-- Draft only. Do not apply without Science/Rick approval.
-- Phase B: close legacy direct browser INSERT access to public.captacao_leads.
-- Apply only after Phase A is applied, the frontend RPC rollout is deployed, and
-- public lead creation is smoked through public.public_captacao_lead_create.
--
-- Rollback for Phase B:
--   grant insert on table public.captacao_leads to anon;
--   grant insert on table public.captacao_leads to authenticated;

begin;

do $$
begin
  if to_regclass('public.captacao_leads') is null then
    raise exception 'missing_table_public_captacao_leads';
  end if;

  if to_regprocedure('public.public_captacao_lead_create('
    'uuid,text,text,text,text,text,text,text,text,text,text,text,'
    'text,text,text,text,text,text,text,text,text,uuid,text,bigint,text)'
  ) is null then
    raise exception 'missing_function_public_captacao_lead_create';
  end if;
end;
$$;

revoke insert on table public.captacao_leads from anon;
revoke insert on table public.captacao_leads from authenticated;

comment on function public.public_captacao_lead_create(
  uuid, text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text, text, uuid, text, bigint, text
) is
  'Public captacao lead RPC. Direct anon/authenticated INSERT on captacao_leads closed in Phase B; '
  'rollback grants INSERT back to anon and authenticated.';

commit;
