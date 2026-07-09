-- Fase C (agente WhatsApp): notificação de demanda registrada pelo app.
-- 1) cliente_criar_demanda carimba origem_registro='app_cliente' no payload.
-- 2) Trigger AFTER INSERT em demandas_cliente envia webhook pro n8n (pg_net)
--    SOMENTE pra demandas do app. URL/secret vivem no Vault (inseridos à mão,
--    nunca commitados); sem secrets configurados o trigger é no-op.
-- Rollback: drop trigger trg_demanda_app_notify_whatsapp on public.demandas_cliente;
--           drop function public.demanda_app_notify_whatsapp();
--           recriar cliente_criar_demanda da migration 20260517203529.
begin;

create or replace function public.cliente_criar_demanda(
  p_cliente_id uuid,
  p_tipo text,
  p_payload jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_tipo text := nullif(trim(coalesce(p_tipo, '')), '');
  v_id bigint;
begin
  if v_actor is null then
    raise exception 'cliente_demanda_unauthenticated' using errcode = '42501';
  end if;

  if p_cliente_id is null or v_tipo not in ('emissao', 'outros') or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'cliente_demanda_invalid_input' using errcode = '23514';
  end if;

  if not public.can_manage_client(p_cliente_id) then
    raise exception 'cliente_demanda_forbidden' using errcode = '42501';
  end if;

  -- Carimbo à direita do || : sobrescreve qualquer origem_registro vindo do cliente.
  insert into public.demandas_cliente(cliente_id, tipo, status, payload)
  values (p_cliente_id, v_tipo, 'pendente', p_payload || jsonb_build_object('origem_registro', 'app_cliente'))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.cliente_criar_demanda(uuid, text, jsonb) from public, anon;
grant execute on function public.cliente_criar_demanda(uuid, text, jsonb) to authenticated, service_role;

create or replace function public.demanda_app_notify_whatsapp()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_url text;
  v_secret text;
  v_nome text;
  v_equipe uuid;
  v_body jsonb;
begin
  if coalesce(new.payload->>'origem_registro', '') <> 'app_cliente' then
    return new;
  end if;

  begin
    select decrypted_secret into v_url
      from vault.decrypted_secrets where name = 'n8n_demanda_webhook_url';
    select decrypted_secret into v_secret
      from vault.decrypted_secrets where name = 'n8n_demanda_webhook_secret';
    if v_url is null or v_secret is null then
      return new; -- infra de notificação ainda não configurada: no-op silencioso
    end if;

    select coalesce(nullif(trim(p.nome), ''), p.nome_completo), p.equipe_id
      into v_nome, v_equipe
      from public.perfis p
     where p.usuario_id = new.cliente_id
     limit 1;

    v_body := jsonb_build_object(
      'evento', 'demanda_registrada',
      'demanda_id', new.id,
      'cliente_id', new.cliente_id,
      'cliente_nome', v_nome,
      'equipe_id', v_equipe,
      'tipo', new.tipo,
      'status', new.status,
      'created_at', new.created_at,
      'gestor_id', nullif(new.payload->>'targetGestorId', ''),
      'resumo', jsonb_build_object(
        'origem', new.payload->>'origem',
        'destino', new.payload->>'destino',
        'dataIda', new.payload->>'dataIda',
        'dataVolta', new.payload->>'dataVolta',
        'passageiros', new.payload->'passageiros',
        'classeVoo', new.payload->>'classeVoo',
        'escopo', coalesce(new.payload->>'escopo', new.payload->>'escopoVoo'),
        'categoria', new.payload->>'categoria',
        'detalhes', new.payload->>'detalhes'
      )
    );

    perform net.http_post(
      url := v_url,
      body := v_body,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', v_secret
      )
    );
  exception when others then
    -- Notificação é best-effort: NUNCA derruba a criação da demanda.
    raise warning 'demanda_app_notify_whatsapp falhou (demanda %): %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

revoke all on function public.demanda_app_notify_whatsapp() from public, anon, authenticated;

drop trigger if exists trg_demanda_app_notify_whatsapp on public.demandas_cliente;
create trigger trg_demanda_app_notify_whatsapp
  after insert on public.demandas_cliente
  for each row execute function public.demanda_app_notify_whatsapp();

commit;
