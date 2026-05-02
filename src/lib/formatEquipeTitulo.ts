/**
 * Normaliza o nome da equipe para cabeçalhos (ex.: com `uppercase` no CSS).
 * "Equipe do João Carvalho" → "Equipe João Carvalho" → "EQUIPE JOÃO CARVALHO".
 */
export function formatEquipeTituloExibicao(nome: string): string {
  return nome.trim().replace(/^equipe\s+do\s+/i, "Equipe ");
}

/**
 * Texto do ticket de emissão: sempre prefixo **EQUIPE** + nome (sem duplicar "Equipe").
 * "João Carvalho" → "EQUIPE João Carvalho" (o CSS em `uppercase` vira "EQUIPE JOÃO CARVALHO").
 */
export function formatEquipeNomeTicketResumo(nome: string): string {
  let s = formatEquipeTituloExibicao(nome).trim();
  if (!s) return "";
  s = s.replace(/^equipe\s+/i, "").trim();
  return `EQUIPE ${s}`;
}
