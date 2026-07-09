import { timingSafeEqual } from "node:crypto";

// Guard do canal server-to-server (n8n → BFF). A chave vive só em env do
// backend e em credencial do n8n — nunca no front. Comparação em tempo
// constante pra não vazar tamanho/prefixo por timing.
export function agentKeyStatus(providedKey, envKey) {
  const expected = (envKey ?? "").trim();
  if (!expected) return "missing_env";
  const a = Buffer.from((providedKey ?? "").trim());
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return "mismatch";
  return "ok";
}
