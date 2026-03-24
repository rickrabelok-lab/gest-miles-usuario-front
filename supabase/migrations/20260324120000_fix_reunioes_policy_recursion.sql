-- Corrige recursão infinita de RLS entre:
-- - reunioes_onboarding (select consulta participantes)
-- - reunioes_onboarding_participantes (select consulta reunioes_onboarding)
--
-- Estratégia:
-- remover a dependência de participantes dentro da policy de SELECT de reunioes_onboarding.
-- Assim quebramos o ciclo mantendo segurança por equipe/criador/admin.

drop policy if exists reunioes_onboarding_select on public.reunioes_onboarding;

create policy reunioes_onboarding_select on public.reunioes_onboarding
  for select
  using (
    public.is_admin()
    or created_by = auth.uid()
    or public.can_access_equipe(equipe_id)
  );
