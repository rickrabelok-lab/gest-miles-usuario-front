/** Formata milhas para exibição pt-BR, ex.: -800000 → "−800.000" (menos Unicode). */
export function formatMilhas(n: number): string {
  const abs = Math.abs(Math.trunc(n));
  const formatted = abs.toLocaleString("pt-BR");
  if (n < 0) return `−${formatted}`;
  if (n > 0) return formatted;
  return "0";
}
