import { Router } from "express";
import { supabase, createSupabaseWithAuth } from "../lib/supabase.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

/** POST /api/auth/signup - Cadastro com email/senha */
router.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "email e password são obrigatórios" });
    }
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    return res.json({
      user: data.user,
      session: data.session,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erro ao cadastrar" });
  }
});

/** POST /api/auth/login - Login com email/senha */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "email e password são obrigatórios" });
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return res.status(401).json({ error: error.message });
    }
    return res.json({
      user: data.user,
      session: data.session,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erro ao fazer login" });
  }
});

/** POST /api/auth/magic-link - Envia link mágico por email */
router.post("/magic-link", async (req, res) => {
  try {
    const { email, redirectTo } = req.body || {};
    if (!email) {
      return res.status(400).json({ error: "email é obrigatório" });
    }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo || undefined },
    });
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    return res.json({ ok: true, message: "Link enviado por email" });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erro ao enviar link" });
  }
});

/** GET /api/auth/session - Retorna sessão atual (requer Bearer token) */
router.get("/session", requireAuth, async (req, res) => {
  try {
    const client = createSupabaseWithAuth(req.accessToken);
    const { data: { session }, error } = await client.auth.getSession();
    if (error) {
      return res.status(401).json({ error: error.message });
    }
    return res.json({ session, user: session?.user ?? null });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erro ao obter sessão" });
  }
});

/** GET /api/auth/user - Retorna usuário atual (requer Bearer token) */
router.get("/user", requireAuth, async (req, res) => {
  try {
    const client = createSupabaseWithAuth(req.accessToken);
    const { data: { user }, error } = await client.auth.getUser();
    if (error) {
      return res.status(401).json({ error: error.message });
    }
    return res.json({ user });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erro ao obter usuário" });
  }
});

export default router;
