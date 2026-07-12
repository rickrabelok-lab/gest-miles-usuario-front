import { Router } from "express";
import { assertSupabaseService } from "../lib/supabaseService.js";
import { serverError } from "../lib/httpError.js";
import { agentKeyStatus } from "../lib/agentAuth.js";
import { planOnboarding } from "../lib/groupClientMatch.js";

const router = Router();

function jidFromTelefone(numeroTelefone) {
  const d = String(numeroTelefone ?? "").replace(/\D/g, "");
  if (d.length < 10 || d.length > 13) return null;
  const withCc = d.startsWith("55") ? d : "55" + d;
  return withCc + "@s.whatsapp.net";
}

/**
 * POST /api/agent/group-onboarding — server-to-server (n8n gm-grupo-onboarding).
 * Auth: header x-api-key === AGENT_API_KEY. Descobre/upserta grupos e auto-mapeia
 * ao cliente pelo nome (match único); os incertos voltam em `revisar`.
 */
router.post("/group-onboarding", async (req, res) => {
  try {
    const keyStatus = agentKeyStatus(req.get("x-api-key"), process.env.AGENT_API_KEY);
    if (keyStatus === "missing_env") {
      return res.status(503).json({ error: "AGENT_API_KEY não configurada no servidor." });
    }
    if (keyStatus === "mismatch") {
      return res.status(401).json({ error: "API key inválida." });
    }

    const tenantId = Number(req.body?.tenant_id);
    const groups = Array.isArray(req.body?.groups) ? req.body.groups : [];
    if (!tenantId || groups.length === 0) {
      return res.status(400).json({ error: "tenant_id e groups são obrigatórios." });
    }

    const supabase = assertSupabaseService();

    const { data: tenant, error: tErr } = await supabase
      .from("agent_tenants")
      .select("id, equipe_id")
      .eq("id", tenantId)
      .maybeSingle();
    if (tErr) return serverError(res, "Erro ao ler tenant", tErr, "[group-onboarding]");
    if (!tenant?.equipe_id) return res.status(404).json({ error: "tenant sem equipe." });

    // 1) upsert grupos (idempotente por grupo_jid): lê existentes, insere só os novos.
    const jids = groups.map((g) => g.jid);
    const { data: existentes, error: gErr } = await supabase
      .from("agent_grupos")
      .select("id, grupo_jid")
      .eq("tenant_id", tenantId)
      .in("grupo_jid", jids);
    if (gErr) return serverError(res, "Erro ao ler grupos", gErr, "[group-onboarding]");
    const byJid = new Map((existentes ?? []).map((g) => [g.grupo_jid, g.id]));
    const novos = groups
      .filter((g) => !byJid.has(g.jid))
      .map((g) => ({ tenant_id: tenantId, grupo_jid: g.jid, descricao: g.nome, ativo: true }));
    if (novos.length > 0) {
      const { data: inseridos, error: insErr } = await supabase
        .from("agent_grupos")
        .insert(novos)
        .select("id, grupo_jid");
      if (insErr) return serverError(res, "Erro ao inserir grupos", insErr, "[group-onboarding]");
      for (const g of inseridos ?? []) byJid.set(g.grupo_jid, g.id);
    }

    // 2) clientes da equipe + telefones
    const { data: perfis, error: pErr } = await supabase
      .from("perfis")
      .select("usuario_id, nome, nome_completo, numero_telefone")
      .eq("equipe_id", tenant.equipe_id)
      .limit(2000);
    if (pErr) return serverError(res, "Erro ao ler perfis", pErr, "[group-onboarding]");
    const clients = (perfis ?? []).map((p) => ({
      cliente_id: p.usuario_id,
      nome: (p.nome ?? "").trim() || p.nome_completo || "",
    }));
    const telById = new Map((perfis ?? []).map((p) => [p.usuario_id, p.numero_telefone]));

    // 3) grupos que já têm vínculo de cliente (não remapeia)
    const grupoIds = groups.map((g) => byJid.get(g.jid)).filter(Boolean);
    const { data: vinc, error: vErr } = await supabase
      .from("agent_vinculos")
      .select("grupo_id")
      .eq("tipo", "cliente")
      .not("cliente_id", "is", null)
      .in("grupo_id", grupoIds);
    if (vErr) return serverError(res, "Erro ao ler vínculos", vErr, "[group-onboarding]");
    const mappedGrupoIds = new Set((vinc ?? []).map((v) => v.grupo_id));
    const alreadyMappedJids = groups
      .filter((g) => mappedGrupoIds.has(byJid.get(g.jid)))
      .map((g) => g.jid);

    // 4) plano de match (puro)
    const plan = planOnboarding(groups, clients, alreadyMappedJids);

    // 5) insere os auto-mapeados
    const toInsert = plan.autoMap.map((m) => ({
      grupo_id: byJid.get(m.jid),
      cliente_id: m.cliente_id,
      tipo: "cliente",
      nome_exibicao: m.cliente_nome,
      participante_jid: jidFromTelefone(telById.get(m.cliente_id)) ?? "onboarding-pending",
      ativo: true,
    }));
    if (toInsert.length > 0) {
      const { error: aErr } = await supabase.from("agent_vinculos").insert(toInsert);
      if (aErr) return serverError(res, "Erro ao criar vínculos", aErr, "[group-onboarding]");
    }

    return res.json({
      descobertos: plan.descobertos,
      auto_mapeados: plan.autoMap.length,
      ja_mapeados: plan.jaMapeados,
      revisar: plan.revisar.map((r) => ({ grupo: r.nome, candidatos: r.candidatos })),
    });
  } catch (err) {
    return serverError(res, "Erro no onboarding de grupos", err, "[group-onboarding]");
  }
});

export default router;
