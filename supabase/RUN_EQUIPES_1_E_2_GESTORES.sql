-- =============================================================================
-- Duas equipes separadas (gestores por e-mail)
--
-- Equipe 1: rick.rabelok@gmail.com + silmaradesouzaaraujo@gmail.com
-- Equipe 2: bolsastart@gmail.com
--
-- Rode no Supabase → SQL Editor como postgres / service role (precisa ler auth.users).
-- No bloco abaixo, opcionalmente defina: cs_email text := 'email-do-cs@...'; para vincular o CS às duas equipes.
-- Se antes todos estavam na mesma equipe, remova linhas antigas em equipe_gestores (Table Editor) para não duplicar.
-- =============================================================================

do $$
declare
  id_e1 uuid;
  id_e2 uuid;
  id_cs   uuid;
  -- Email do usuário com role CS que supervisiona as duas equipes no painel /cs.
  -- Ex.: 'cs@empresa.com'. Se deixar NULL, preencha depois em equipe_cs (Table Editor).
  cs_email text := null;
begin
  -- 1) Criar equipes (nomes únicos para não duplicar se rodar de novo)
  if not exists (select 1 from public.equipes where nome = 'Equipe 1 — Rick e Silmara') then
    insert into public.equipes (nome) values ('Equipe 1 — Rick e Silmara');
  end if;
  select id into id_e1 from public.equipes where nome = 'Equipe 1 — Rick e Silmara' limit 1;

  if not exists (select 1 from public.equipes where nome = 'Equipe 2 — Bolsastart') then
    insert into public.equipes (nome) values ('Equipe 2 — Bolsastart');
  end if;
  select id into id_e2 from public.equipes where nome = 'Equipe 2 — Bolsastart' limit 1;

  -- 2) Gestores em cada equipe (auth.users.id = gestor no app)
  insert into public.equipe_gestores (equipe_id, gestor_id)
  select id_e1, u.id
  from auth.users u
  where lower(u.email) in (
    lower('rick.rabelok@gmail.com'),
    lower('silmaradesouzaaraujo@gmail.com')
  )
  on conflict do nothing;

  insert into public.equipe_gestores (equipe_id, gestor_id)
  select id_e2, u.id
  from auth.users u
  where lower(u.email) = lower('bolsastart@gmail.com')
  on conflict do nothing;

  -- 3) CS enxerga cada equipe (uma linha por equipe para o mesmo CS)
  if cs_email is not null and length(trim(cs_email)) > 0 then
    select id into id_cs from auth.users where lower(email) = lower(trim(cs_email));
    if id_cs is not null then
      insert into public.equipe_cs (equipe_id, cs_id) values (id_e1, id_cs) on conflict do nothing;
      insert into public.equipe_cs (equipe_id, cs_id) values (id_e2, id_cs) on conflict do nothing;
    end if;
  end if;

  raise notice 'Equipe 1 id: %', id_e1;
  raise notice 'Equipe 2 id: %', id_e2;
end $$;

-- Verificação rápida (opcional)
select
  e.nome as equipe,
  u.email as gestor
from public.equipe_gestores eg
join public.equipes e on e.id = eg.equipe_id
join auth.users u on u.id = eg.gestor_id
where e.nome in ('Equipe 1 — Rick e Silmara', 'Equipe 2 — Bolsastart')
order by e.nome, u.email;
