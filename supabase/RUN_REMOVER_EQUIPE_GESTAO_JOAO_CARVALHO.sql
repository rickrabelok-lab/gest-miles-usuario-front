-- =============================================================================
-- Remove a equipe antiga "Gestão Joao Carvalho" do select do painel CS.
--
-- O dropdown lê public.equipes; essa linha é antiga (ex. insert de teste).
-- equipe_cs e equipe_gestores têm ON DELETE CASCADE → somem junto.
--
-- Rode no Supabase → SQL Editor (role com permissão DELETE em public.equipes).
-- =============================================================================

-- 1) Confira o que será apagado (opcional)
select id, nome, created_at
from public.equipes
where nome ilike '%joao carvalho%'
   or nome ilike '%joão carvalho%';

-- 2) Apagar (ajuste o nome se o seu registro for ligeiramente diferente)
delete from public.equipes
where nome in (
  'Gestão Joao Carvalho',
  'Gestão João Carvalho'
);

-- Se ainda sobrar alguma variação, use uma vez (cuidado: só essa equipe):
-- delete from public.equipes where id = 'COLE_O_UUID_DA_LINHA_AQUI';
