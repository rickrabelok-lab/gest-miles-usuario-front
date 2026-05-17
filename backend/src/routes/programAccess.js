import { Router } from "express";
import crypto from "node:crypto";
import { createSupabaseWithAuth } from "../lib/supabase.js";
import { assertSupabaseService } from "../lib/supabaseService.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
const SECRET_ACTION = "view_secret";
const MANAGER_ROLES = new Set(["admin", "admin_master", "admin_equipe", "gestor", "cs"]);

function encryptionKey() {
  const raw = process.env.PROGRAM_ACCESS_ENCRYPTION_KEY;
  if (!raw || raw.trim().length < 16) {
    throw new Error("PROGRAM_ACCESS_ENCRYPTION_KEY nao configurada no backend.");
  }
  return crypto.createHash("sha256").update(raw).digest();
}

function encryptSecret(value) {
  const text = String(value ?? "");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

function decryptSecret(value) {
  const raw = String(value ?? "");
  const [version, ivB64, tagB64, dataB64] = raw.split(":");
  if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("Formato de segredo invalido.");
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

function sanitizeText(value, max = 500) {
  const text = String(value ?? "").trim();
  if (text.length > max) return text.slice(0, max);
  return text;
}

async function getCurrentUser(req) {
  const sbAuth = createSupabaseWithAuth(req.accessToken);
  const {
    data: { user },
    error,
  } = await sbAuth.auth.getUser();
  if (error || !user?.id) return { sbAuth, user: null };
  return { sbAuth, user };
}

async function assertCanAccessCliente(req, clienteId) {
  const { sbAuth, user } = await getCurrentUser(req);
  if (!user) {
    const err = new Error("Sessao invalida.");
    err.status = 401;
    throw err;
  }

  const { data: actorPerfil, error: actorErr } = await sbAuth
    .from("perfis")
    .select("role, equipe_id")
    .eq("usuario_id", user.id)
    .maybeSingle();
  if (actorErr) throw actorErr;

  const role = actorPerfil?.role ?? "user";
  if (!MANAGER_ROLES.has(role)) {
    const err = new Error("Apenas gestor, CS ou admin pode acessar credenciais de programas.");
    err.status = 403;
    throw err;
  }

  const { data: clientePerfil, error: clienteErr } = await sbAuth
    .from("perfis")
    .select("usuario_id, role, equipe_id")
    .eq("usuario_id", clienteId)
    .maybeSingle();
  if (clienteErr) throw clienteErr;
  if (!clientePerfil?.usuario_id) {
    const err = new Error("Cliente nao encontrado ou sem permissao de acesso.");
    err.status = 404;
    throw err;
  }

  const { data: canManage, error: canManageErr } = await sbAuth.rpc("can_manage_client", {
    target_cliente_id: clienteId,
  });
  if (canManageErr) throw canManageErr;
  if (canManage !== true) {
    const err = new Error("Sem permissão para acessar este cliente.");
    err.status = 403;
    throw err;
  }

  return { actorId: user.id, actorRole: role, clientePerfil };
}
async function auditProgramAccess(sb, { acessoId = null, clienteId, actorId, action, metadata = {} }) {
  const { error } = await sb.rpc("cliente_programa_acesso_audit_log_write", {
    p_acesso_id: acessoId,
    p_cliente_id: clienteId,
    p_actor_id: actorId,
    p_action: action,
    p_metadata: metadata,
  });
  if (error) throw error;
}

function rowToResponse(row, reveal) {
  const base = {
    id: row.id,
    cliente_id: row.cliente_id,
    programa: row.programa,
    acesso_status: row.acesso_status,
    created_by: row.created_by,
    updated_by: row.updated_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  if (!reveal) {
    return { ...base, login: "", senha: "", observacoes: "", masked: true };
  }
  return {
    ...base,
    login: decryptSecret(row.login_ciphertext),
    senha: decryptSecret(row.senha_ciphertext),
    observacoes: row.observacoes_ciphertext ? decryptSecret(row.observacoes_ciphertext) : "",
    masked: false,
  };
}

router.get("/clientes/:clienteId/acessos", requireAuth, async (req, res) => {
  try {
    const clienteId = String(req.params.clienteId || "").trim();
    const reveal = String(req.query.reveal || "").toLowerCase() === "true";
    const { actorId } = await assertCanAccessCliente(req, clienteId);
    const sb = assertSupabaseService();

    const { data, error } = await sb
      .from("cliente_programa_acessos")
      .select("*")
      .eq("cliente_id", clienteId)
      .eq("acesso_status", "active")
      .order("programa", { ascending: true });
    if (error) throw error;

    await auditProgramAccess(sb, {
      clienteId,
      actorId,
      action: reveal ? SECRET_ACTION : "list",
      metadata: { count: data?.length ?? 0, reveal },
    });

    return res.json({ acessos: (data ?? []).map((row) => rowToResponse(row, reveal)) });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || "Erro ao listar acessos." });
  }
});

router.post("/clientes/:clienteId/acessos", requireAuth, async (req, res) => {
  try {
    const clienteId = String(req.params.clienteId || "").trim();
    const { actorId } = await assertCanAccessCliente(req, clienteId);
    const programa = sanitizeText(req.body?.programa, 120);
    const login = sanitizeText(req.body?.login, 500);
    const senha = sanitizeText(req.body?.senha, 500);
    const observacoes = sanitizeText(req.body?.observacoes, 1000);
    if (!programa || !login || !senha) {
      return res.status(400).json({ error: "programa, login e senha sao obrigatorios." });
    }

    const sb = assertSupabaseService();
    const payload = {
      cliente_id: clienteId,
      programa,
      login_ciphertext: encryptSecret(login),
      senha_ciphertext: encryptSecret(senha),
      observacoes_ciphertext: observacoes ? encryptSecret(observacoes) : null,
      created_by: actorId,
      updated_by: actorId,
    };
    const { data, error } = await sb.from("cliente_programa_acessos").insert(payload).select("*").single();
    if (error) throw error;

    await auditProgramAccess(sb, {
      acessoId: data.id,
      clienteId,
      actorId,
      action: "create",
      metadata: { programa },
    });

    return res.status(201).json({ acesso: rowToResponse(data, false) });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || "Erro ao criar acesso." });
  }
});

router.patch("/acessos/:acessoId", requireAuth, async (req, res) => {
  try {
    const acessoId = String(req.params.acessoId || "").trim();
    const sb = assertSupabaseService();
    const { data: current, error: curErr } = await sb
      .from("cliente_programa_acessos")
      .select("*")
      .eq("id", acessoId)
      .maybeSingle();
    if (curErr) throw curErr;
    if (!current?.id) return res.status(404).json({ error: "Acesso nao encontrado." });

    const { actorId } = await assertCanAccessCliente(req, current.cliente_id);
    const patch = { updated_by: actorId, updated_at: new Date().toISOString() };
    const changed = [];

    if (req.body?.programa != null) {
      patch.programa = sanitizeText(req.body.programa, 120);
      changed.push("programa");
    }
    if (req.body?.login != null) {
      patch.login_ciphertext = encryptSecret(sanitizeText(req.body.login, 500));
      changed.push("login");
    }
    if (req.body?.senha != null) {
      patch.senha_ciphertext = encryptSecret(sanitizeText(req.body.senha, 500));
      changed.push("senha");
    }
    if (req.body?.observacoes != null) {
      const obs = sanitizeText(req.body.observacoes, 1000);
      patch.observacoes_ciphertext = obs ? encryptSecret(obs) : null;
      changed.push("observacoes");
    }
    if (req.body?.acesso_status != null) {
      const status = sanitizeText(req.body.acesso_status, 20);
      if (!["active", "archived"].includes(status)) {
        return res.status(400).json({ error: "acesso_status invalido." });
      }
      patch.acesso_status = status;
      changed.push("acesso_status");
    }

    const { data, error } = await sb
      .from("cliente_programa_acessos")
      .update(patch)
      .eq("id", acessoId)
      .select("*")
      .single();
    if (error) throw error;

    await auditProgramAccess(sb, {
      acessoId,
      clienteId: current.cliente_id,
      actorId,
      action: patch.acesso_status === "archived" ? "archive" : "update",
      metadata: { changed, programa: data.programa },
    });

    return res.json({ acesso: rowToResponse(data, false) });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || "Erro ao atualizar acesso." });
  }
});

router.delete("/acessos/:acessoId", requireAuth, async (req, res) => {
  try {
    const acessoId = String(req.params.acessoId || "").trim();
    const sb = assertSupabaseService();
    const { data: current, error: curErr } = await sb
      .from("cliente_programa_acessos")
      .select("*")
      .eq("id", acessoId)
      .maybeSingle();
    if (curErr) throw curErr;
    if (!current?.id) return res.status(404).json({ error: "Acesso nao encontrado." });

    const { actorId } = await assertCanAccessCliente(req, current.cliente_id);
    const { error } = await sb
      .from("cliente_programa_acessos")
      .update({ acesso_status: "archived", updated_by: actorId, updated_at: new Date().toISOString() })
      .eq("id", acessoId);
    if (error) throw error;

    await auditProgramAccess(sb, {
      acessoId,
      clienteId: current.cliente_id,
      actorId,
      action: "archive",
      metadata: { programa: current.programa },
    });

    return res.json({ ok: true });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || "Erro ao arquivar acesso." });
  }
});

export default router;
