import "dotenv/config";
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

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/programas-cliente", programasClienteRoutes);
app.use("/api/gestor", gestorRoutes);
app.use("/api/perfis", perfisRoutes);
app.use("/api/demandas", demandasRoutes);
app.use("/api/bonus-offers", bonusOffersRoutes);
app.use("/api/calendar-prices", calendarPricesRoutes);
app.use("/api/demo-flights", demoFlightsRoutes);

app.get("/api/health", (_, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Backend API rodando em http://localhost:${PORT}`);
});
