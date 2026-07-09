// Agrega demandas por equipe e por DUPLA (carteira vw_carteira_dupla) pro resumo
// diário do grupo interno (workflow n8n gm-resumo-demandas). Função pura: recebe
// linhas já enriquecidas com equipe_id/dupla_id/dupla_nome e devolve só contagens —
// o resumo não lista demandas individuais (pedido do owner, 2026-07-09).

const DIA_MS = 86_400_000;

function novaContagem() {
  return { novas_24h: 0, pendentes: 0, em_andamento: 0, paradas_3d: 0 };
}

function acumula(contagens, row, agora) {
  const createdAt = new Date(row.created_at);
  const updatedAt = new Date(row.updated_at ?? row.created_at);
  const ativa = row.status === "pendente" || row.status === "em_andamento";
  const diasParada = Math.max(0, Math.floor((agora - updatedAt) / DIA_MS));

  if (agora - createdAt < DIA_MS) contagens.novas_24h += 1;
  if (row.status === "pendente") contagens.pendentes += 1;
  if (row.status === "em_andamento") contagens.em_andamento += 1;
  if (ativa && diasParada >= 3) contagens.paradas_3d += 1;
}

export function buildDemandasResumo(rows, { agora = new Date() } = {}) {
  const porEquipe = new Map();
  for (const row of rows ?? []) {
    const equipeId = row.equipe_id ?? null;
    if (!porEquipe.has(equipeId)) {
      porEquipe.set(equipeId, { equipe_id: equipeId, contagens: novaContagem(), duplas: new Map() });
    }
    const eq = porEquipe.get(equipeId);
    acumula(eq.contagens, row, agora);

    const duplaId = row.dupla_id ?? null;
    if (!eq.duplas.has(duplaId)) {
      eq.duplas.set(duplaId, { dupla_id: duplaId, dupla_nome: row.dupla_nome ?? null, contagens: novaContagem() });
    }
    acumula(eq.duplas.get(duplaId).contagens, row, agora);
  }

  return {
    equipes: [...porEquipe.values()].map((eq) => ({
      equipe_id: eq.equipe_id,
      contagens: eq.contagens,
      // "Sem dupla" (dupla_id null) sempre por último; o resto em ordem de nome.
      duplas: [...eq.duplas.values()].sort((a, b) => {
        if (a.dupla_id === null) return 1;
        if (b.dupla_id === null) return -1;
        return String(a.dupla_nome ?? "").localeCompare(String(b.dupla_nome ?? ""), "pt-BR");
      }),
    })),
  };
}
