-- =============================================================================
-- Vincula 3 usuários CS às Equipe 1 e Equipe 2 (ambos os grupos).
--
-- Tabela: public.equipe_cs (equipe_id, cs_id) — cada CS enxerga gestores da equipe
-- no painel /cs quando também tiver role "cs" em public.perfis.
--
-- Equipes (mesmos nomes de RUN_EQUIPES_1_E_2_GESTORES.sql):
--   Equipe 1 — Rick e Silmara
--   Equipe 2 — Bolsastart
--
-- Rode no Supabase → SQL Editor (postgres / service role; precisa de auth.users).
-- =============================================================================

insert into public.equipe_cs (equipe_id, cs_id)
select e.id, u.id
from public.equipes e
cross join auth.users u
where e.nome in ('Equipe 1 — Rick e Silmara', 'Equipe 2 — Bolsastart')
  and lower(u.email) in (
    lower('rick_klippel@hotmail.com'),
    lower('adrielescarvalhoo@gmail.com'),
    lower('julia.ruasm@gmail.com')
  )
on conflict do nothing;

-- Verificação: CS × equipe
select
  u.email as cs_email,
  e.nome  as equipe
from public.equipe_cs ec
join public.equipes e on e.id = ec.equipe_id
join auth.users u on u.id = ec.cs_id
where lower(u.email) in (
  lower('rick_klippel@hotmail.com'),
  lower('adrielescarvalhoo@gmail.com'),
  lower('julia.ruasm@gmail.com')
)
and e.nome in ('Equipe 1 — Rick e Silmara', 'Equipe 2 — Bolsastart')
order by u.email, e.nome;

-- Se algum e-mail não aparecer acima, o usuário não existe em auth.users (crie a conta antes).
-- Garanta também em public.perfis: role = 'cs' para cada um, senão o app pode bloquear /cs.
