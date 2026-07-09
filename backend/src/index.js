import "./load-env.js";
import express from "express";
import cors from "cors";
import { initSentry, captureException } from "./lib/sentry.js";

import { handleStripeWebhook } from "./routes/stripeWebhook.js";
import authRoutes from "./routes/auth.js";
import programasClienteRoutes from "./routes/programasCliente.js";
import perfisRoutes from "./routes/perfis.js";
import demandasRoutes from "./routes/demandas.js";
import bonusOffersRoutes from "./routes/bonusOffers.js";
import calendarPricesRoutes from "./routes/calendarPrices.js";
import demoFlightsRoutes from "./routes/demoFlights.js";
import stripeBillingRoutes from "./routes/stripeBilling.js";
import auditLogsRoutes from "./routes/auditLogs.js";
import programAccessRoutes from "./routes/programAccess.js";
import contactRoutes from "./routes/contact.js";
import referralsRoutes from "./routes/referrals.js";
import invitesRoutes from "./routes/invites.js";
import equipeBillingRoutes from "./routes/equipeBilling.js";
import { reconcileEquipeBilling } from "./routes/equipeBillingCron.js";
import accountDeletionRoutes from "./routes/accountDeletion.js";
import agentResumoRoutes from "./routes/agentResumo.js";

initSentry();

const app = express();
const PORT = process.env.PORT || 3000;

const STATIC_ALLOWED_ORIGINS = [
  "https://app.gestmiles.com.br",
  "https://manager.gestmiles.com.br",
  "http://localhost:3002",
  "http://localhost:3080",
];

const allowedCorsOrigins = [
  ...STATIC_ALLOWED_ORIGINS,
  ...[
    process.env.CORS_ORIGINS || "",
    process.env.PUBLIC_APP_URL || "",
    process.env.PUBLIC_MANAGER_URL || "",
  ]
    .join(",")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean),
];

// Em dev (fora da Vercel), libera qualquer porta localhost/127.0.0.1 — o front Vite
// pega a 1ª porta livre a partir de :3081, então fixar portas na allowlist gera drift.
const isDevLocalhostOrigin = (origin) =>
  !process.env.VERCEL && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedCorsOrigins.includes(origin) || isDevLocalhostOrigin(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Origin not allowed by CORS."));
  },
  credentials: true,
};

app.use(cors(corsOptions));

/** Raiz — evita 404 ao abrir o URL do deploy na Vercel */
app.get("/", (_req, res) => {
  res.json({ ok: true, service: "gest-miles-api", health: "/api/health" });
});

app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  handleStripeWebhook,
);

app.use(express.json());

const routes = express.Router();

routes.use("/api/auth", authRoutes);
routes.use("/api/programas-cliente", programasClienteRoutes);
routes.use("/api/perfis", perfisRoutes);
routes.use("/api/demandas", demandasRoutes);
routes.use("/api/bonus-offers", bonusOffersRoutes);
routes.use("/api/calendar-prices", calendarPricesRoutes);
routes.use("/api/demo-flights", demoFlightsRoutes);
routes.use("/api/stripe", stripeBillingRoutes);
routes.use("/api/audit-logs", auditLogsRoutes);
routes.use("/api/program-access", programAccessRoutes);
routes.use("/api/contact", contactRoutes);
routes.use("/api/referrals", referralsRoutes);
routes.use("/api/invites", invitesRoutes);
routes.use("/api/equipe-billing", equipeBillingRoutes);
routes.get("/api/equipe-billing/cron/reconcile", reconcileEquipeBilling);
routes.use("/api/account", accountDeletionRoutes);
routes.use("/api/agent", agentResumoRoutes);

routes.get("/api/health", (_, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

if (process.env.VERCEL) {
  app.use((req, _res, next) => {
    if (req.url.startsWith("/_/backend")) {
      req.url = req.url.slice("/_/backend".length) || "/";
    }
    next();
  });
}
app.use(routes);

// Error-handler global: safety net pra erros não-tratados (4 args = middleware de erro).
// Loga o erro real e responde genérico (não vaza err.message). WS3 pluga Sentry aqui.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("[backend] erro não-tratado:", err?.stack || err?.message || err);
  captureException(err);
  if (res.headersSent) return next(err);
  res.status(err?.status || 500).json({ error: "Erro interno. Tente novamente." });
});

export default app;

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Backend API rodando em http://localhost:${PORT}`);
  });
}
