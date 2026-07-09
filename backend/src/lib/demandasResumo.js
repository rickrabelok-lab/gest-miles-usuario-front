// Agrega demandas por equipe pro resumo diário do grupo interno (workflow n8n
// gm-resumo-demandas). Função pura: recebe linhas já enriquecidas com
// cliente_nome/equipe_id e devolve contagens + lista curta por equipe.

const DIA_MS = 86_400_000;

function resumoCurto(tipo, payload) {
  const p = payload ?? {};
  if (tipo === "emissao") {
    const rota = [p.origem, p.destino].filter(Boolean).join(" → ");
    return rota || "emissão";
  }
  return p.categoria || "outros";
}

export function buildDemandasResumo(rows, { agora = new Date() } = {}) {
  const porEquipe = new Map();
  for (const row of rows ?? []) {
    const equipeId = row.equipe_id ?? null;
    if (!porEquipe.has(equipeId)) {
      porEquipe.set(equipeId, {
        equipe_id: equipeId,
        contagens: { novas_24h: 0, pendentes: 0, em_andamento: 0, paradas_3d: 0 },
        demandas: [],
      });
    }
    const eq = porEquipe.get(equipeId);
    const createdAt = new Date(row.created_at);
    const updatedAt = new Date(row.updated_at ?? row.created_at);
    const ativa = row.status === "pendente" || row.status === "em_andamento";
    const diasParada = Math.max(0, Math.floor((agora - updatedAt) / DIA_MS));

    if (agora - createdAt < DIA_MS) eq.contagens.novas_24h += 1;
    if (row.status === "pendente") eq.contagens.pendentes += 1;
    if (row.status === "em_andamento") eq.contagens.em_andamento += 1;
    if (ativa && diasParada >= 3) eq.contagens.paradas_3d += 1;

    if (ativa) {
      eq.demandas.push({
        id: row.id,
        cliente_nome: row.cliente_nome ?? null,
        tipo: row.tipo,
        status: row.status,
        resumo_curto: resumoCurto(row.tipo, row.payload),
        dias_parada: diasParada,
      });
    }
  }
  const equipes = [...porEquipe.values()];
  for (const eq of equipes) eq.demandas.sort((a, b) => b.dias_parada - a.dias_parada);
  return { equipes };
}
