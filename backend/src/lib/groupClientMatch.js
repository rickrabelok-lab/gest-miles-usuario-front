// Matching de grupo WhatsApp -> cliente por nome contido (borda de palavra).
// Puro e testável; a rota /api/agent/group-onboarding consome.

export function normalizeNome(text) {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contidoComBorda(clienteNorm, grupoNorm) {
  if (!clienteNorm) return false;
  return (" " + grupoNorm + " ").includes(" " + clienteNorm + " ");
}

export function matchGroupsToClients(groups, clients) {
  const norm = clients
    .map((c) => ({ cliente_id: c.cliente_id, nome: c.nome, _n: normalizeNome(c.nome) }))
    .filter((c) => c._n);
  return groups.map((g) => {
    const gn = normalizeNome(g.nome);
    const candidatos = norm
      .filter((c) => contidoComBorda(c._n, gn))
      .map((c) => ({ cliente_id: c.cliente_id, nome: c.nome }));
    return { jid: g.jid, nome: g.nome, candidatos };
  });
}

export function planOnboarding(groups, clients, alreadyMappedJids = []) {
  const mapped = new Set(alreadyMappedJids);
  const matched = matchGroupsToClients(groups, clients);
  const autoMap = [];
  const revisar = [];
  let jaMapeados = 0;
  for (const g of matched) {
    if (mapped.has(g.jid)) {
      jaMapeados++;
      continue;
    }
    if (g.candidatos.length === 1) {
      autoMap.push({
        jid: g.jid,
        nome: g.nome,
        cliente_id: g.candidatos[0].cliente_id,
        cliente_nome: g.candidatos[0].nome,
      });
    } else {
      revisar.push({ jid: g.jid, nome: g.nome, candidatos: g.candidatos.map((c) => c.nome) });
    }
  }
  return { autoMap, revisar, jaMapeados, descobertos: groups.length };
}
