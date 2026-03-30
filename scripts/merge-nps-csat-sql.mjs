import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const supabase = path.join(root, "supabase");

const header = `-- =============================================================================
-- NPS + CSAT: rode UMA VEZ no Supabase (corrige "Could not find table ... schema cache")
-- Painel: https://supabase.com/dashboard → seu projeto → SQL Editor → New query → Run
--
-- Precisa já existir: equipes, perfis, cliente_gestores, emissoes,
-- funções cs_can_access_gestor e is_legacy_platform_admin.
--
-- Depois: espere ~1 min ou recarregue o app (PostgREST atualiza o cache do schema).
-- Ou use: supabase db push (projeto linkado).
-- =============================================================================

`;

const nps = fs.readFileSync(
  path.join(supabase, "migrations", "20260325140000_nps_avaliacoes.sql"),
  "utf8",
);
const csat = fs.readFileSync(
  path.join(supabase, "migrations", "20260325180000_csat_avaliacoes.sql"),
  "utf8",
);
fs.writeFileSync(path.join(supabase, "RUN_NPS_E_CSAT.sql"), `${header}\n${nps}\n\n${csat}`, "utf8");
console.log("Wrote supabase/RUN_NPS_E_CSAT.sql");
