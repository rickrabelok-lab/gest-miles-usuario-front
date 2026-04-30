-- Fase 6.C — Drop final de gestor_clientes.
--
-- Pré-requisitos verificados:
--   • Front 100% lendo de cliente_gestores (Fase 6.A).
--   • Funções SQL refatoradas, triggers/view dropados, writes bloqueados (Fase 6.B).
--   • Endpoints REST que escreviam (gestor.js + gestorService.ts) removidos (Fase 6.C — pré-SQL).
--   • Validação manual no app feita pelo usuário antes desta migration.
--
-- Esta migration:
--   1. Drop tabela gestor_clientes (cascade limpa as 2 policies SELECT remanescentes).

drop table if exists public.gestor_clientes cascade;
