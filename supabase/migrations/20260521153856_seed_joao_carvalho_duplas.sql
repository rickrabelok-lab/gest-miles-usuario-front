begin;

insert into public.equipes_duplas (equipe_id, ordem, nome, gestor_nacional_id, gestor_internacional_id)
select
  e.id,
  v.ordem,
  v.nome,
  nac.id,
  intl.id
from public.equipes e
cross join (values
  (1, 'Equipe 1 - Guilherme + Filipe', 'redacted@example.com', 'redacted@example.com'),
  (2, 'Equipe 2 - Tiago + Silmara', 'redacted@example.com', 'redacted@example.com'),
  (3, 'Equipe 3 - Rick + Jessica', 'redacted@example.com', 'redacted@example.com'),
  (4, 'Equipe 4 - Diogo + Ana', 'redacted@example.com', 'redacted@example.com'),
  (5, 'Equipe 5 - Wesley + Carla', 'redacted@example.com', 'redacted@example.com')
) as v(ordem, nome, email_nac, email_intl)
inner join auth.users nac on lower(nac.email) = lower(v.email_nac)
inner join auth.users intl on lower(intl.email) = lower(v.email_intl)
where e.nome = 'João Carvalho'
  and not exists (
    select 1
    from public.equipes_duplas ed
    where ed.equipe_id = e.id
      and ed.gestor_nacional_id = nac.id
      and ed.gestor_internacional_id = intl.id
  );

commit;
