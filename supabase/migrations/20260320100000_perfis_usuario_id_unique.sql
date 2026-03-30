-- Garantir unicidade do perfil por usuário (perfis.usuario_id)
-- Causa observada no app: erro "multiple (or no) rows returned" com `.maybeSingle()`
-- quando existem duplicados para o mesmo `usuario_id`.

-- 1) Remover duplicados mantendo o registro com menor `id`.
with ranked as (
  select
    id,
    row_number() over (partition by usuario_id order by id) as rn
  from public.perfis
  where usuario_id is not null
)
delete from public.perfis p
using ranked r
where p.id = r.id
  and r.rn > 1;

-- 2) Criar índice único (impõe UNIQUE(usuario_id)).
-- Se você ainda tiver duplicados, este comando falha.
create unique index if not exists perfis_usuario_id_uidx on public.perfis (usuario_id);

