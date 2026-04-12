import "./load-env.js";
import express from "express";
import cors from "cors";

import { handleStripeWebhook } from "./routes/stripeWebhook.js";
import authRoutes from "./routes/auth.js";
import programasClienteRoutes from "./routes/programasCliente.js";
import gestorRoutes from "./routes/gestor.js";
import perfisRoutes from "./routes/perfis.js";
import demandasRoutes from "./routes/demandas.js";
import bonusOffersRoutes from "./routes/bonusOffers.js";
import calendarPricesRoutes from "./routes/calendarPrices.js";
import demoFlightsRoutes from "./routes/demoFlights.js";
import stripeBillingRoutes from "./routes/stripeBilling.js";
import auditLogsRoutes from "./routes/auditLogs.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: true, credentials: true }));

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
routes.use("/api/gestor", gestorRoutes);
routes.use("/api/perfis", perfisRoutes);
routes.use("/api/demandas", demandasRoutes);
routes.use("/api/bonus-offers", bonusOffersRoutes);
routes.use("/api/calendar-prices", calendarPricesRoutes);
routes.use("/api/demo-flights", demoFlightsRoutes);
routes.use("/api/stripe", stripeBillingRoutes);
routes.use("/api/audit-logs", auditLogsRoutes);

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

export default app;

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Backend API rodando em http://localhost:${PORT}`);
  });
}
