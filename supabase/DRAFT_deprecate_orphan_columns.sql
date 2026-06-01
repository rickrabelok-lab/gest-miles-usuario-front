-- =============================================================================
-- DRAFT — DEPRECAR COLUNAS ÓRFÃS  (⚠️ NÃO APLICAR AINDA — VER PRÉ-CONDIÇÃO)
-- =============================================================================
-- Status : RASCUNHO para revisão da equipe. NÃO é migration pronta; não está em
--          supabase/migrations/ de propósito.
-- Banco  : jntkpcjmmnaghmimdcam — PRODUÇÃO COMPARTILHADA (usuario/manager/admin),
--          sem staging. Coordenar entre os 3 repos antes de aplicar.
-- Origem : sessão Claude Code, 2026-06-01 (inspeção read-only via MCP + grep nos 3 fronts).
--
-- O QUE FAZ
--   Remove 3 colunas FÍSICAS já substituídas. Os nomes HOMÔNIMOS que continuam
--   EM USO permanecem intactos (chaves do jsonb `preferencias`, params de RPC
--   `p_preferencia_destino`/`p_preferencia_classe`/`p_only_clube_nome`, campos TS):
--     • programas_cliente.clube_nome           → substituída por `categoria`
--     • preferencias_usuario.preferencia_destino → migrada p/ `preferencias` (jsonb)
--     • preferencias_usuario.preferencia_classe  → migrada p/ `preferencias` (jsonb)
--
-- EVIDÊNCIA (prod, 2026-06-01)
--   • programas_cliente: 169 linhas; clube_nome NOT NULL em 0; órfãs (clube sem categoria) 0.
--   • preferencias_usuario: 0 linhas.
--   • Nenhuma RPC grava as colunas físicas:
--       - cliente_preferencias_sugestoes_save_self / manager_preferencias_sugestoes_save
--         gravam SOMENTE `preferencias` (jsonb).
--       - save_programa_cliente grava `categoria`/`clube_plano` e apenas LÊ o
--         `clube_nome` legado de dentro do payload JSON (não da coluna).
--   • Nenhum índice, view ou policy depende das 3 colunas (drop limpo).
--   • Leitura nos fronts:
--       - usuario-front : `.select("preferencias")` (jsonb) + `.select("*")` em programas_cliente → SEGURO.
--       - manager-front (ativo): `.select("preferencias")` (jsonb) → SEGURO.
--
-- ⚠️ PRÉ-CONDIÇÃO QUE BLOQUEIA A APLICAÇÃO
--   gest-miles-admin-front — apps/manager-app/src/hooks/usePreferenciasSugestoes.ts:29
--   ainda faz `.select("preferencia_destino, preferencia_classe")` DIRETO na tabela.
--   Hoje degrada para default em erro (não quebra), mas APÓS o DROP passará a tomar
--   HTTP 400 a cada load e nunca mais carregará preferência salva nesse app.
--   ➜ ANTES de aplicar, migrar esse hook para `.select("preferencias")` + leitura via
--     jsonb (copiar o padrão de usuario-front / manager-front ativo) e fazer deploy.
--
-- REVERSIBILIDADE
--   Re-adicionar coluna é trivial, mas o dado físico se perde no drop. Como as fontes
--   novas (categoria / preferencias jsonb) já são as canônicas e as físicas estão vazias
--   hoje, não há perda real. Ainda assim: snapshot/backup do banco antes de aplicar.
--
-- LOCK
--   Cada `drop column` pega ACCESS EXCLUSIVE por instantes (operação de catálogo, sem
--   rewrite de tabela). Rápido nessas tabelas pequenas.
-- =============================================================================

begin;

-- 1) Backfill defensivo e idempotente — protege contra perda de dado caso a migration
--    seja aplicada no futuro JÁ COM dados nas colunas físicas (hoje estão vazias).

-- programas_cliente: só preenche categoria quando vazia e clube_nome tem valor.
update public.programas_cliente
set categoria = clube_nome
where clube_nome is not null
  and (categoria is null or categoria = '');

-- preferencias_usuario: completa SOMENTE as chaves ausentes no jsonb a partir das
-- colunas. Ordem `derivado || existente` faz as chaves já presentes no jsonb vencerem.
update public.preferencias_usuario
set preferencias =
      jsonb_build_object(
        'preferencia_destino', to_jsonb(coalesce(preferencia_destino, array[]::text[])),
        'preferencia_classe',  coalesce(nullif(trim(preferencia_classe), ''), 'Todas')
      ) || coalesce(preferencias, '{}'::jsonb)
where not (preferencias ? 'preferencia_destino')
   or not (preferencias ? 'preferencia_classe');

-- 2) Drops idempotentes das colunas físicas substituídas.
alter table public.programas_cliente    drop column if exists clube_nome;
alter table public.preferencias_usuario drop column if exists preferencia_destino;
alter table public.preferencias_usuario drop column if exists preferencia_classe;

commit;

-- =============================================================================
-- CHECKLIST PRÉ-APLICAÇÃO (equipe)
--   [ ] admin-front migrado p/ ler `preferencias` (jsonb) e deployado.
--   [ ] Re-rodar a evidência acima (counts) — confirmar que segue 0 dado órfão.
--   [ ] Backup/snapshot do banco compartilhado.
--   [ ] Aplicar em janela de baixa concorrência.
--   [ ] Smoke nos 3 fronts (preferências + categoria de programa) pós-aplicação.
-- =============================================================================
