-- Corrige upsert de `gestor_clientes` no app (onConflict: cliente_id,gestor_id).
-- A tabela legada tinha `unique (cliente_id)` → um único gestor por cliente, par incompatível
-- com o modelo nacional/internacional (dois gestores) e com o PostgREST:
-- "there is no unique or exclusion constraint matching the ON CONFLICT specification".

-- Remoção de qualquer UNIQUE em apenas (cliente_id) — o nome padrão costuma ser gestor_clientes_cliente_id_key.
do $$
declare
  cname text;
begin
  if to_regclass('public.gestor_clientes') is null then
    return;
  end if;
  for cname in
    select c.conname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1] and not a.attisdropped
    where c.conrelid = 'public.gestor_clientes'::regclass
      and c.contype = 'u'
      and c.conkey is not null
      and array_length(c.conkey, 1) = 1
      and a.attname = 'cliente_id'
  loop
    execute format('alter table public.gestor_clientes drop constraint %I', cname);
  end loop;
end
$$;

-- Mesmo grão que `cliente_gestores`: pares (cliente, gestor) unicos, varios por cliente.
create unique index if not exists uq_gestor_clientes_cliente_id_gestor_id
  on public.gestor_clientes (cliente_id, gestor_id);

comment on index public.uq_gestor_clientes_cliente_id_gestor_id is
  'Alinha a tabela legada a cliente_gestores: permite nac+intl; necessario para upsert Supabase (onConflict).';
