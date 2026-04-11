import "./load-env.js";
import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth.js";
import programasClienteRoutes from "./routes/programasCliente.js";
import gestorRoutes from "./routes/gestor.js";
import perfisRoutes from "./routes/perfis.js";
import demandasRoutes from "./routes/demandas.js";
import bonusOffersRoutes from "./routes/bonusOffers.js";
import calendarPricesRoutes from "./routes/calendarPrices.js";
import demoFlightsRoutes from "./routes/demoFlights.js";
import passwordResetRoutes from "./routes/passwordReset.js";
import invitesRoutes from "./routes/invites.js";
import registrationRoutes from "./routes/registration.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const routes = express.Router();

routes.use("/api/auth", authRoutes);
routes.use("/api/auth", passwordResetRoutes);
routes.use("/api/programas-cliente", programasClienteRoutes);
routes.use("/api/gestor", gestorRoutes);
routes.use("/api/perfis", perfisRoutes);
routes.use("/api/demandas", demandasRoutes);
routes.use("/api/bonus-offers", bonusOffersRoutes);
routes.use("/api/calendar-prices", calendarPricesRoutes);
routes.use("/api/demo-flights", demoFlightsRoutes);
routes.use("/api/invites", invitesRoutes);
routes.use("/api/registration", registrationRoutes);

routes.get("/api/health", (_, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// Na Vercel (Services) o pedido pode vir como /_/backend/api/... ou já sem o prefixo.
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

// Desenvolvimento local: `npm run dev` em backend/. Na Vercel (Services) usa-se o export default.
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Backend API rodando em http://localhost:${PORT}`);
  });
}
