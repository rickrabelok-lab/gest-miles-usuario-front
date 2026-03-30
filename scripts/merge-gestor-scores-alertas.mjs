import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const supabase = path.join(root, "supabase");

const header = `-- =============================================================================
-- INSTRUÇÕES (faça só isto no navegador):
--
-- 1) Abra: https://supabase.com/dashboard  → escolha SEU projeto
-- 2) Menu esquerdo: SQL Editor
-- 3) Botão "New query"
-- 4) No Cursor: abra o arquivo supabase/RUN_GESTOR_SCORES_E_ALERTAS.sql
--    Selecione TUDO (Ctrl+A) → Copie (Ctrl+C) → Cole na janela do SQL Editor
-- 5) Clique em RUN (ou F5)
--
-- Se der erro falando de nps_avaliacoes / csat / função inexistente:
--    Rode ANTES o arquivo supabase/RUN_NPS_E_CSAT.sql (mesmo processo: copiar tudo → SQL Editor → Run).
--    Para gerar RUN_NPS_E_CSAT.sql de novo: npm run merge:nps-csat
--
-- Depois de rodar com sucesso: no app, Painel CS → "Atualizar ranking" e "Atualizar alertas".
-- =============================================================================

`;

const scores = fs.readFileSync(
  path.join(supabase, "migrations", "20260325210000_gestor_scores.sql"),
  "utf8",
);
const alertas = fs.readFileSync(
  path.join(supabase, "migrations", "20260325220000_alertas_sistema.sql"),
  "utf8",
);

const out = path.join(supabase, "RUN_GESTOR_SCORES_E_ALERTAS.sql");
fs.writeFileSync(out, `${header}\n${scores}\n\n${alertas}\n`, "utf8");
console.log("OK →", out);
