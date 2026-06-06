// Mude para true quando implementar a emissão via Gest Miles
export const GESTMILES_EMISSION_ENABLED = false

// Gate B2C por plano_ativo (billing B2B). OFF por padrão: só ligar APÓS o backfill
// que ativa os clientes existentes (senão bloqueia toda a base). Liga via env na Vercel.
export const B2C_PLAN_GATE_ENABLED = import.meta.env.VITE_B2C_PLAN_GATE_ENABLED === "true"
