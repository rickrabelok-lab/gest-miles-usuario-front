-- ── contratos_cliente: adicionar FK cliente_id ────────────────────────────────
-- 1. Adiciona coluna nullable (sem quebrar registros existentes)
ALTER TABLE public.contratos_cliente
  ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Backfill por email (prioridade: match exato case-insensitive)
UPDATE public.contratos_cliente cc
SET cliente_id = au.id
FROM auth.users au
WHERE cc.cliente_id IS NULL
  AND cc.cliente_email IS NOT NULL
  AND LOWER(TRIM(cc.cliente_email)) = LOWER(TRIM(au.email));

-- 3. Backfill restantes por nome normalizado (perfis.nome_completo)
UPDATE public.contratos_cliente cc
SET cliente_id = p.usuario_id
FROM public.perfis p
WHERE cc.cliente_id IS NULL
  AND cc.cliente_nome IS NOT NULL
  AND LOWER(REGEXP_REPLACE(TRIM(cc.cliente_nome), '\s+', ' ', 'g')) =
      LOWER(REGEXP_REPLACE(TRIM(p.nome_completo), '\s+', ' ', 'g'));

-- 4. Remover duplicatas: para cada (cliente_id, equipe_id) com mais de um contrato
--    ativo ou pendente, mantém o com status 'ativo' (ou o mais recente se empate).
DELETE FROM public.contratos_cliente
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY cliente_id, equipe_id
        ORDER BY
          CASE status_cliente
            WHEN 'ativo'    THEN 1
            WHEN 'pendente' THEN 2
            ELSE                 3
          END,
          COALESCE(updated_at, created_at) DESC
      ) AS rn
    FROM public.contratos_cliente
    WHERE cliente_id IS NOT NULL
      AND status_cliente != 'inativo'
  ) ranked
  WHERE rn > 1
);

-- 5. UNIQUE index parcial: um contrato ativo/pendente por (cliente_id, equipe_id).
--    Contratos inativos (histórico) podem ser múltiplos.
CREATE UNIQUE INDEX IF NOT EXISTS contratos_cliente_cliente_equipe_ativo_unique
  ON public.contratos_cliente (cliente_id, equipe_id)
  WHERE cliente_id IS NOT NULL AND status_cliente != 'inativo';

-- 6. Índice de busca por cliente_id para queries do useGestor
CREATE INDEX IF NOT EXISTS contratos_cliente_cliente_id_idx
  ON public.contratos_cliente (cliente_id);
