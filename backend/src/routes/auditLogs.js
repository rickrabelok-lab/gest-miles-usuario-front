import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { assertSupabaseService } from "../lib/supabaseService.js";
import { createSupabaseWithAuth } from "../lib/supabase.js";

const router = Router();

const AUDIT_LOGS_MISSING_HINT =
  "A tabela public.audit_logs ainda não existe neste projeto Supabase. " +
  "No SQL Editor do dashboard: abra o ficheiro gest-miles-usuario-front/supabase/RUN_AUDIT_LOGS.sql, copie todo o conteúdo, execute (Run). " +
  "Alternativa: migrations 20260416120000_audit_logs.sql e 20260416130000_audit_logs_equipe_id.sql em supabase/migrations, ou `supabase db push`. " +
  "Depois reinicie o backend Express.";

const MERGE_FETCH_CAP = 4000;
const PERFIS_IN_CHUNK = 120;

function mapAuditLogsSupabaseError(err) {
  const msg = String(err?.message ?? "");
  const code = String(err?.code ?? "");
  const lower = msg.toLowerCase();
  if (lower.includes("relationship")) return null;
  const looksLikeMissingTable =
    lower.includes("schema cache") ||
    code === "PGRST205" ||
    (lower.includes("could not find") &&
      (lower.includes("audit_logs") || lower.includes("logs_acoes")) &&
      lower.includes("table"));
  if (looksLikeMissingTable) {
    return { status: 503, message: AUDIT_LOGS_MISSING_HINT };
  }
  return null;
}

function isNonFatalListError(err) {
  const msg = String(err?.message ?? "").toLowerCase();
  const code = String(err?.code ?? "");
  return (
    code === "PGRST103" ||
    msg.includes("range not satisfiable") ||
    msg.includes("http range error") ||
    msg.includes("416")
  );
}

/** @param {string | import("express").Request["query"][string]} v */
function parseUuidParam(v) {
  if (v == null || typeof v !== "string") return null;
  const t = v.trim();
  if (t.length !== 36) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) return null;
  return t;
}

function haystackForSearch(row, nomeMap) {
  const nome = nomeMap?.get(row.user_id ?? "");
  const parts = [
    row.acao,
    row.tabela,
    row.user_id ?? "",
    nome ?? "",
    JSON.stringify(row.antes ?? {}),
    JSON.stringify(row.depois ?? {}),
  ];
  return parts.join(" ").toLowerCase();
}

function matchesSearchRow(row, qLower, nomeMap) {
  if (!qLower) return true;
  return haystackForSearch(row, nomeMap).includes(qLower);
}

async function prefetchNomeByUserId(sb, rows) {
  const ids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  const map = new Map();
  for (let i = 0; i < ids.length; i += PERFIS_IN_CHUNK) {
    const slice = ids.slice(i, i + PERFIS_IN_CHUNK);
    const { data, error } = await sb
      .from("perfis")
      .select("usuario_id, nome_completo")
      .in("usuario_id", slice);
    if (error) throw error;
    for (const p of data ?? []) {
      if (p?.usuario_id) map.set(p.usuario_id, p.nome_completo ?? "");
    }
  }
  return map;
}

async function enrichAuditLogsWithPerfis(sb, rows) {
  const list = rows ?? [];
  const ids = [...new Set(list.map((r) => r.user_id).filter(Boolean))];
  if (ids.length === 0) {
    return list.map((r) => ({ row: r, perfil: null }));
  }
  const allPerfis = [];
  for (let i = 0; i < ids.length; i += PERFIS_IN_CHUNK) {
    const slice = ids.slice(i, i + PERFIS_IN_CHUNK);
    const { data: perfis, error } = await sb
      .from("perfis")
      .select("usuario_id, nome_completo, role, equipe_id, configuracao_tema")
      .in("usuario_id", slice);
    if (error) throw error;
    allPerfis.push(...(perfis ?? []));
  }
  const byUser = new Map(allPerfis.map((p) => [p.usuario_id, p]));
  return list.map((r) => ({
    row: r,
    perfil: r.user_id ? byUser.get(r.user_id) ?? null : null,
  }));
}

async function fetchEquipeNomeMap(sb, ids) {
  const uniq = [...new Set(ids.filter(Boolean).map((id) => String(id).trim()))];
  if (uniq.length === 0) return new Map();
  const { data, error } = await sb.from("equipes").select("id, nome").in("id", uniq);
  if (error) throw error;
  return new Map((data ?? []).map((e) => [String(e.id), e.nome]));
}

/** `admin_equipe` sem `perfis.equipe_id`: primeira equipa em `equipe_admin`. */
async function primeiraEquipeAdminPorUtilizador(sb, userId) {
  if (!userId) return null;
  const { data, error } = await sb
    .from("equipe_admin")
    .select("equipe_id")
    .eq("ativo", true)
    .or(`admin_equipe_id_1.eq.${userId},admin_equipe_id_2.eq.${userId},admin_equipe_id_3.eq.${userId}`)
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data?.equipe_id ? String(data.equipe_id).trim() : null;
}

async function mapPrimeiraEquipePorAdminEquipe(sb, userIds) {
  const map = new Map();
  const uniq = [...new Set(userIds.filter(Boolean))];
  for (const uid of uniq) {
    const eid = await primeiraEquipeAdminPorUtilizador(sb, uid);
    if (eid) map.set(String(uid), eid);
  }
  return map;
}

/** `entidade_id` em snapshots operacionais = `auth.users.id` do cliente. */
function collectEntidadeClienteIds(rows) {
  const s = new Set();
  for (const row of rows ?? []) {
    for (const snap of [row.depois, row.antes]) {
      if (!snap || typeof snap !== "object") continue;
      const eid = snap.entidade_id;
      if (typeof eid === "string" && parseUuidParam(eid)) s.add(eid.trim());
    }
  }
  return [...s];
}

async function fetchClienteNomesPorUsuarioId(sb, usuarioIds) {
  const map = new Map();
  const list = [...new Set(usuarioIds.filter(Boolean))];
  for (let i = 0; i < list.length; i += PERFIS_IN_CHUNK) {
    const slice = list.slice(i, i + PERFIS_IN_CHUNK);
    const { data, error } = await sb
      .from("perfis")
      .select("usuario_id, nome_completo")
      .in("usuario_id", slice);
    if (error) throw error;
    for (const p of data ?? []) {
      if (p?.usuario_id) map.set(String(p.usuario_id), p.nome_completo ?? null);
    }
  }
  return map;
}

function snapshotsComNomeCliente(antes, depois, clienteNomeMap) {
  const patch = (o) => {
    if (!o || typeof o !== "object" || Array.isArray(o)) return o;
    const eid = o.entidade_id;
    if (typeof eid !== "string") return o;
    const id = parseUuidParam(eid);
    if (!id) return o;
    const nome = clienteNomeMap.get(String(id));
    if (!nome) return o;
    return { ...o, cliente_nome_completo: nome };
  };
  return { antes: patch(antes), depois: patch(depois) };
}

function sendJsonSafe(res, payload) {
  try {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.send(
      JSON.stringify(payload, (_key, value) => (typeof value === "bigint" ? value.toString() : value)),
    );
  } catch {
    res.status(500).json({ error: "Falha ao serializar resposta dos logs." });
  }
}

async function resolveAuditLogAccess(sb, userId, perfil) {
  if (!perfil?.role) return { kind: "deny" };

  const role = perfil.role;
  const equipeIdPerfil = perfil.equipe_id ?? null;

  if (role === "admin" && equipeIdPerfil == null) {
    return { kind: "all" };
  }

  if (role === "admin" && equipeIdPerfil != null) {
    return { kind: "equipes", ids: [equipeIdPerfil] };
  }

  if (role === "admin_equipe") {
    const ids = new Set();
    if (equipeIdPerfil) ids.add(equipeIdPerfil);

    const { data: rows, error } = await sb
      .from("equipe_admin")
      .select("equipe_id")
      .eq("ativo", true)
      .or(
        `admin_equipe_id_1.eq.${userId},admin_equipe_id_2.eq.${userId},admin_equipe_id_3.eq.${userId}`,
      );

    if (error) {
      if (ids.size === 0) return { kind: "deny" };
    } else {
      for (const r of rows ?? []) {
        if (r?.equipe_id) ids.add(r.equipe_id);
      }
    }

    return { kind: "equipes", ids: [...ids] };
  }

  return { kind: "deny" };
}

async function resolveActorIdsForEquipes(sb, equipeIds, selfId) {
  const uniq = new Set(selfId ? [selfId] : []);
  if (!equipeIds?.length) return [...uniq];
  const { data, error } = await sb.from("perfis").select("usuario_id").in("equipe_id", equipeIds);
  if (error) throw error;
  for (const r of data ?? []) {
    if (r?.usuario_id) uniq.add(r.usuario_id);
  }
  return [...uniq];
}

/**
 * Actores para `logs_acoes` + filtro opcional por equipa (query `equipe_id`).
 */
async function resolveLogsActorIds(sb, access, userId, req) {
  const filterEquipe = parseUuidParam(req.query.equipe_id);
  if (access.kind === "all") {
    if (!filterEquipe) return null;
    return resolveActorIdsForEquipes(sb, [filterEquipe], null);
  }
  if (access.kind === "equipes") {
    if (filterEquipe) {
      if (!access.ids.includes(filterEquipe)) return [];
      return resolveActorIdsForEquipes(sb, [filterEquipe], userId);
    }
    return resolveActorIdsForEquipes(sb, access.ids, userId);
  }
  return null;
}

function applyAuditFilters(query, req) {
  let b = query;
  if (req.query.tabela) b = b.eq("tabela", req.query.tabela);
  if (req.query.acao) b = b.eq("acao", req.query.acao);
  if (req.query.user_id) b = b.eq("user_id", req.query.user_id);
  if (req.query.from) b = b.gte("created_at", req.query.from);
  if (req.query.to) b = b.lte("created_at", req.query.to);
  const filterEquipe = parseUuidParam(req.query.equipe_id);
  if (filterEquipe) b = b.eq("equipe_id", filterEquipe);
  return b;
}

function applyLogsFilters(query, req) {
  let b = query;
  if (req.query.tabela) b = b.eq("entidade_afetada", req.query.tabela);
  if (req.query.acao) b = b.eq("tipo_acao", req.query.acao);
  if (req.query.user_id) b = b.eq("user_id", req.query.user_id);
  if (req.query.from) b = b.gte("timestamp", req.query.from);
  if (req.query.to) b = b.lte("timestamp", req.query.to);
  return b;
}

function buildAuditQuery(sb, access, selectList) {
  let q = sb
    .from("audit_logs")
    .select(selectList)
    .order("created_at", { ascending: false });
  if (access.kind === "equipes") {
    if (access.ids.length === 1) q = q.eq("equipe_id", access.ids[0]);
    else q = q.in("equipe_id", access.ids);
  }
  return q;
}

function buildLogsQuery(sb, access, selectList, actorIds) {
  let q = sb
    .from("logs_acoes")
    .select(selectList)
    .order("timestamp", { ascending: false });
  if (access.kind === "equipes") {
    if (!actorIds || actorIds.length === 0) return null;
    if (actorIds.length === 1) q = q.eq("user_id", actorIds[0]);
    else q = q.in("user_id", actorIds);
  } else if (actorIds != null) {
    if (actorIds.length === 0) return null;
    if (actorIds.length === 1) q = q.eq("user_id", actorIds[0]);
    else q = q.in("user_id", actorIds);
  }
  return q;
}

function tsDesc(row, kind) {
  const raw = kind === "audit" ? row?.created_at : row?.timestamp;
  const t = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
}

function mergeAuditAndLogsDesc(auditRows, logRows) {
  const merged = [];
  let i = 0;
  let j = 0;
  while (i < auditRows.length || j < logRows.length) {
    const a = auditRows[i];
    const b = logRows[j];
    if (a == null) {
      merged.push({ kind: "logs", row: b });
      j += 1;
      continue;
    }
    if (b == null) {
      merged.push({ kind: "audit", row: a });
      i += 1;
      continue;
    }
    if (tsDesc(a, "audit") >= tsDesc(b, "logs")) {
      merged.push({ kind: "audit", row: a });
      i += 1;
    } else {
      merged.push({ kind: "logs", row: b });
      j += 1;
    }
  }
  return merged;
}

async function safeFetch(queryBuilder) {
  const { data, error } = await queryBuilder;
  if (error) {
    if (isNonFatalListError(error)) return [];
    const mapped = mapAuditLogsSupabaseError(error);
    if (mapped) return [];
    throw error;
  }
  return data ?? [];
}

async function fetchAuditRows(sb, access, req, rangeEnd) {
  const q = applyAuditFilters(
    buildAuditQuery(sb, access, "id, user_id, acao, tabela, antes, depois, equipe_id, created_at"),
    req,
  ).range(0, rangeEnd);
  return safeFetch(q);
}

async function fetchLogsRows(sb, access, actorIds, req, rangeEnd) {
  const base = buildLogsQuery(
    sb,
    access,
    "id, user_id, tipo_acao, entidade_afetada, entidade_id, details, timestamp",
    actorIds,
  );
  if (!base) return [];
  const q = applyLogsFilters(base, req).range(0, rangeEnd);
  return safeFetch(q);
}

function normalizeMergedEntry({ kind, row }) {
  if (kind === "audit") {
    return {
      source: "auditoria",
      id: row.id,
      user_id: row.user_id,
      acao: row.acao,
      tabela: row.tabela,
      antes: row.antes,
      depois: row.depois,
      equipe_id: row.equipe_id,
      created_at: row.created_at,
    };
  }
  const depois = { ...(row.details ?? {}) };
  if (row.entidade_id != null && row.entidade_id !== "") {
    depois.entidade_id = row.entidade_id;
  }
  return {
    source: "operacional",
    id: `logs_acoes:${row.id}`,
    user_id: row.user_id,
    acao: row.tipo_acao,
    tabela: row.entidade_afetada,
    antes: null,
    depois,
    equipe_id: null,
    created_at: row.timestamp,
  };
}

async function listMergedNormalizedInCap(sb, access, userId, req) {
  const lim = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const off = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const cap = Math.min(MERGE_FETCH_CAP, Math.max(off + lim + 50, 100));
  const last = cap - 1;
  const actorIds = await resolveLogsActorIds(sb, access, userId, req);
  const [auditRows, logRows] = await Promise.all([
    fetchAuditRows(sb, access, req, last),
    fetchLogsRows(sb, access, actorIds, req, last),
  ]);
  return mergeAuditAndLogsDesc(auditRows, logRows).map(normalizeMergedEntry);
}

async function safeCount(queryBuilder) {
  try {
    const { count, error } = await queryBuilder;
    if (error) {
      if (mapAuditLogsSupabaseError(error)) return 0;
      throw error;
    }
    return count ?? 0;
  } catch (e) {
    if (mapAuditLogsSupabaseError(e)) return 0;
    console.error("[audit-logs] safeCount", e?.message ?? e);
    return 0;
  }
}

async function countAudit(sb, access, req) {
  let q = sb.from("audit_logs").select("id", { count: "exact", head: true });
  if (access.kind === "equipes") {
    if (access.ids.length === 1) q = q.eq("equipe_id", access.ids[0]);
    else q = q.in("equipe_id", access.ids);
  }
  q = applyAuditFilters(q, req);
  return safeCount(q);
}

async function countLogs(sb, access, actorIds, req) {
  if (actorIds != null && actorIds.length === 0) return 0;
  let q = sb.from("logs_acoes").select("id", { count: "exact", head: true });
  if (actorIds != null) {
    if (actorIds.length === 1) q = q.eq("user_id", actorIds[0]);
    else q = q.in("user_id", actorIds);
  }
  q = applyLogsFilters(q, req);
  return safeCount(q);
}

/**
 * GET /api/audit-logs
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const sbAuth = createSupabaseWithAuth(req.accessToken);
    const {
      data: { user },
      error: authErr,
    } = await sbAuth.auth.getUser();
    if (authErr || !user) {
      return res.status(401).json({ error: "Sessão inválida." });
    }

    const sb = assertSupabaseService();

    const { data: perfil, error: pErr } = await sb
      .from("perfis")
      .select("role, equipe_id")
      .eq("usuario_id", user.id)
      .maybeSingle();

    if (pErr) return res.status(500).json({ error: pErr.message });

    const access = await resolveAuditLogAccess(sb, user.id, perfil);
    if (access.kind === "deny") {
      return res.status(403).json({ error: "Apenas administradores podem ver logs de auditoria." });
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    if (access.kind === "equipes" && access.ids.length === 0) {
      return sendJsonSafe(res, { logs: [], total: 0, limit, offset });
    }

    const qLower = (typeof req.query.q === "string" ? req.query.q.trim() : "").toLowerCase();

    let mergedNormalized;
    let total;
    try {
      const actorIds = await resolveLogsActorIds(sb, access, user.id, req);
      if (access.kind === "equipes" && Array.isArray(actorIds) && actorIds.length === 0) {
        return sendJsonSafe(res, { logs: [], total: 0, limit, offset });
      }

      const allInCap = await listMergedNormalizedInCap(sb, access, user.id, req);

      let working = allInCap;
      if (qLower) {
        const nomeMap = await prefetchNomeByUserId(sb, allInCap);
        working = allInCap.filter((r) => matchesSearchRow(r, qLower, nomeMap));
        total = working.length;
      } else {
        const [cA, cL] = await Promise.all([countAudit(sb, access, req), countLogs(sb, access, actorIds, req)]);
        total = cA + cL;
      }

      mergedNormalized = working.slice(offset, offset + limit);
    } catch (e) {
      const mapped = mapAuditLogsSupabaseError(e);
      if (mapped) return res.status(mapped.status).json({ error: mapped.message });
      console.error("[audit-logs] GET /", e?.stack ?? e?.message ?? e);
      return res.status(500).json({ error: e?.message ?? String(e) });
    }

    let enriched;
    try {
      enriched = await enrichAuditLogsWithPerfis(sb, mergedNormalized);
    } catch (enrErr) {
      const mapped = mapAuditLogsSupabaseError(enrErr);
      if (mapped) return res.status(mapped.status).json({ error: mapped.message });
      console.error("[audit-logs] enrich", enrErr?.stack ?? enrErr?.message ?? enrErr);
      return res.status(500).json({ error: enrErr?.message ?? String(enrErr) });
    }

    const equipeIdsForNome = [];
    const adminEquipeUserIds = [];
    for (const { row, perfil: p } of enriched) {
      if (row.equipe_id) equipeIdsForNome.push(row.equipe_id);
      else if (p?.equipe_id) equipeIdsForNome.push(p.equipe_id);
      else if (String(p?.role ?? "").toLowerCase() === "admin_equipe" && row.user_id) adminEquipeUserIds.push(row.user_id);
    }

    let adminEquipePorUser = new Map();
    try {
      adminEquipePorUser = await mapPrimeiraEquipePorAdminEquipe(sb, adminEquipeUserIds);
    } catch (admErr) {
      console.error("[audit-logs] equipe_admin fallback", admErr?.message ?? admErr);
    }
    for (const eid of adminEquipePorUser.values()) equipeIdsForNome.push(eid);

    let equipeNomeById;
    try {
      equipeNomeById = await fetchEquipeNomeMap(sb, equipeIdsForNome);
    } catch (eqErr) {
      console.error("[audit-logs] equipes", eqErr?.message ?? eqErr);
      equipeNomeById = new Map();
    }

    let clienteNomeMap = new Map();
    try {
      clienteNomeMap = await fetchClienteNomesPorUsuarioId(sb, collectEntidadeClienteIds(mergedNormalized));
    } catch (clErr) {
      console.error("[audit-logs] clientes em detalhes", clErr?.message ?? clErr);
    }

    const payload = {
      logs: enriched.map(({ row, perfil: p }) => {
        const eidRow = row.equipe_id != null ? String(row.equipe_id).trim() : null;
        const eidPerfil = p?.equipe_id != null ? String(p.equipe_id).trim() : null;
        const eidAdminEquipe =
          row.user_id && String(p?.role ?? "").toLowerCase() === "admin_equipe"
            ? adminEquipePorUser.get(String(row.user_id)) ?? null
            : null;
        let equipeNome = null;
        if (eidRow) equipeNome = equipeNomeById.get(eidRow) ?? null;
        if (!equipeNome && eidPerfil) equipeNome = equipeNomeById.get(eidPerfil) ?? null;
        if (!equipeNome && eidAdminEquipe) equipeNome = equipeNomeById.get(String(eidAdminEquipe)) ?? null;

        const { antes: antesOut, depois: depoisOut } = snapshotsComNomeCliente(
          row.antes,
          row.depois,
          clienteNomeMap,
        );

        return {
          source: row.source,
          id: row.id,
          user_id: row.user_id,
          user_name: p?.nome_completo ?? null,
          user_role: p?.role ?? null,
          user_equipe_id: p?.equipe_id ?? null,
          user_configuracao_tema:
            p?.configuracao_tema && typeof p.configuracao_tema === "object" && !Array.isArray(p.configuracao_tema)
              ? p.configuracao_tema
              : null,
          acao: row.acao,
          tabela: row.tabela,
          antes: antesOut,
          depois: depoisOut,
          equipe_id: row.equipe_id,
          equipe_nome: equipeNome,
          created_at: row.created_at,
        };
      }),
      total,
      limit,
      offset,
    };
    return sendJsonSafe(res, payload);
  } catch (e) {
    console.error("[audit-logs] unhandled", e?.stack ?? e?.message ?? e);
    return res.status(500).json({ error: e?.message || "Erro ao listar audit logs." });
  }
});

/**
 * GET /api/audit-logs/tables
 */
router.get("/tables", requireAuth, async (req, res) => {
  try {
    const sbAuth = createSupabaseWithAuth(req.accessToken);
    const {
      data: { user },
      error: authErr,
    } = await sbAuth.auth.getUser();
    if (authErr || !user) {
      return res.status(401).json({ error: "Sessão inválida." });
    }

    const sb = assertSupabaseService();
    const { data: perfil } = await sb
      .from("perfis")
      .select("role, equipe_id")
      .eq("usuario_id", user.id)
      .maybeSingle();

    const access = await resolveAuditLogAccess(sb, user.id, perfil);
    if (access.kind === "deny") {
      return res.status(403).json({ error: "Apenas administradores." });
    }

    if (access.kind === "equipes" && access.ids.length === 0) {
      return res.json({ tables: [] });
    }

    let auditTables = [];
    let logsTables = [];

    try {
      const aq = buildAuditQuery(sb, access, "tabela").limit(5000);
      const { data: ad, error: aErr } = await aq;
      if (aErr) throw aErr;
      auditTables = [...new Set((ad ?? []).map((r) => r.tabela).filter(Boolean))];

      const actorIds = await resolveLogsActorIds(sb, access, user.id, req);
      const lq = buildLogsQuery(sb, access, "entidade_afetada", actorIds);
      if (lq) {
        const { data: ld, error: lErr } = await lq.limit(5000);
        if (lErr) throw lErr;
        logsTables = [...new Set((ld ?? []).map((r) => r.entidade_afetada).filter(Boolean))];
      }
    } catch (e) {
      const mapped = mapAuditLogsSupabaseError(e);
      if (mapped) return res.status(mapped.status).json({ error: mapped.message });
      console.error("[audit-logs] GET /tables", e?.stack ?? e?.message ?? e);
      return res.status(500).json({ error: e?.message ?? String(e) });
    }

    const unique = [...new Set([...auditTables, ...logsTables])].sort((a, b) => a.localeCompare(b));
    return res.json({ tables: unique });
  } catch (e) {
    console.error("[audit-logs] tables unhandled", e?.stack ?? e?.message ?? e);
    return res.status(500).json({ error: e?.message || "Erro ao listar tabelas." });
  }
});

/**
 * GET /api/audit-logs/meta — opções para filtros (tabelas, ações, equipas, utilizadores).
 */
router.get("/meta", requireAuth, async (req, res) => {
  try {
    const sbAuth = createSupabaseWithAuth(req.accessToken);
    const {
      data: { user },
      error: authErr,
    } = await sbAuth.auth.getUser();
    if (authErr || !user) {
      return res.status(401).json({ error: "Sessão inválida." });
    }

    const sb = assertSupabaseService();
    const { data: perfil } = await sb
      .from("perfis")
      .select("role, equipe_id")
      .eq("usuario_id", user.id)
      .maybeSingle();

    const access = await resolveAuditLogAccess(sb, user.id, perfil);
    if (access.kind === "deny") {
      return res.status(403).json({ error: "Apenas administradores." });
    }

    if (access.kind === "equipes" && access.ids.length === 0) {
      return res.json({ tables: [], acoes: [], equipes: [], users: [] });
    }

    const actorIds = await resolveLogsActorIds(sb, access, user.id, req);

    let auditTables = [];
    let logsTables = [];
    const acoesSet = new Set();
    const userIdSet = new Set();

    try {
      const aqT = buildAuditQuery(sb, access, "tabela").limit(3000);
      const { data: adT, error: aErrT } = await aqT;
      if (aErrT) throw aErrT;
      auditTables = [...new Set((adT ?? []).map((r) => r.tabela).filter(Boolean))];

      const aqA = buildAuditQuery(sb, access, "acao").limit(3000);
      const { data: adA, error: aErrA } = await aqA;
      if (aErrA) throw aErrA;
      for (const r of adA ?? []) {
        if (r?.acao) acoesSet.add(r.acao);
      }

      const aqU = buildAuditQuery(sb, access, "user_id").limit(3000);
      const { data: adU, error: aErrU } = await aqU;
      if (aErrU) throw aErrU;
      for (const r of adU ?? []) {
        if (r?.user_id) userIdSet.add(r.user_id);
      }

      const lqE = buildLogsQuery(sb, access, "entidade_afetada", actorIds);
      if (lqE) {
        const { data: ldE, error: lErrE } = await lqE.limit(3000);
        if (lErrE) throw lErrE;
        logsTables = [...new Set((ldE ?? []).map((r) => r.entidade_afetada).filter(Boolean))];
      }

      const lqA = buildLogsQuery(sb, access, "tipo_acao", actorIds);
      if (lqA) {
        const { data: ldA, error: lErrA } = await lqA.limit(3000);
        if (lErrA) throw lErrA;
        for (const r of ldA ?? []) {
          if (r?.tipo_acao) acoesSet.add(r.tipo_acao);
        }
      }

      const lqU = buildLogsQuery(sb, access, "user_id", actorIds);
      if (lqU) {
        const { data: ldU, error: lErrU } = await lqU.limit(3000);
        if (lErrU) throw lErrU;
        for (const r of ldU ?? []) {
          if (r?.user_id) userIdSet.add(r.user_id);
        }
      }
    } catch (e) {
      const mapped = mapAuditLogsSupabaseError(e);
      if (mapped) return res.status(mapped.status).json({ error: mapped.message });
      console.error("[audit-logs] GET /meta", e?.stack ?? e?.message ?? e);
      return res.status(500).json({ error: e?.message ?? String(e) });
    }

    const tables = [...new Set([...auditTables, ...logsTables])].sort((a, b) => a.localeCompare(b));
    const acoes = [...acoesSet].sort((a, b) => a.localeCompare(b));

    let equipesRows = [];
    try {
      if (access.kind === "all") {
        const { data, error } = await sb.from("equipes").select("id, nome").order("nome", { ascending: true }).limit(500);
        if (!error) equipesRows = data ?? [];
      } else {
        const { data, error } = await sb
          .from("equipes")
          .select("id, nome")
          .in("id", access.ids)
          .order("nome", { ascending: true });
        if (!error) equipesRows = data ?? [];
      }
    } catch (eqE) {
      console.error("[audit-logs] meta equipes", eqE?.message ?? eqE);
    }

    const userIds = [...userIdSet];
    const usersOut = [];
    for (let i = 0; i < userIds.length; i += PERFIS_IN_CHUNK) {
      const slice = userIds.slice(i, i + PERFIS_IN_CHUNK);
      const { data: perfisChunk, error: pe } = await sb
        .from("perfis")
        .select("usuario_id, nome_completo")
        .in("usuario_id", slice);
      if (pe) break;
      for (const p of perfisChunk ?? []) {
        if (p?.usuario_id) {
          usersOut.push({ id: p.usuario_id, nome_completo: p.nome_completo ?? null });
        }
      }
    }
    usersOut.sort((a, b) => (a.nome_completo ?? "").localeCompare(b.nome_completo ?? "", "pt"));

    return res.json({
      tables,
      acoes,
      equipes: equipesRows,
      users: usersOut,
    });
  } catch (e) {
    console.error("[audit-logs] meta unhandled", e?.stack ?? e?.message ?? e);
    return res.status(500).json({ error: e?.message || "Erro ao carregar meta dos logs." });
  }
});

export default router;
