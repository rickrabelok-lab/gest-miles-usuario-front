import { Router } from "express";

const hash = (value) => {
  let output = 0;
  for (let i = 0; i < value.length; i += 1) {
    output = (output << 5) - output + value.charCodeAt(i);
    output |= 0;
  }
  return Math.abs(output);
};

const getMonthDays = (date) => {
  const year = date.getFullYear();
  const month = date.getMonth();
  return new Date(year, month + 1, 0).getDate();
};

const monthKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const generateMockMonthPrices = ({ originCode, destinationCode, mode, month }) => {
  const totalDays = getMonthDays(month);
  const monthToken = monthKey(month);
  const pricesByDay = new Map();

  for (let day = 1; day <= totalDays; day += 1) {
    const seed = hash(`${originCode}-${destinationCode}-${mode}-${monthToken}-${day}`);
    const hasPrice = seed % 9 !== 0;
    if (!hasPrice) continue;

    if (mode === "points") {
      const value = 3500 + (seed % 17000);
      pricesByDay.set(day, Math.round(value / 100) * 100);
      continue;
    }

    const moneyValue = 220 + (seed % 1700);
    pricesByDay.set(day, Math.round(moneyValue));
  }

  return Object.fromEntries(pricesByDay);
};

const router = Router();

/** GET /api/calendar-prices?origin=SAO&destination=RIO&mode=money&month=2026-03 - Preços do calendário (mock) */
router.get("/", async (req, res) => {
  try {
    await new Promise((r) => setTimeout(r, 220));
    const originCode = req.query.origin || "SAO";
    const destinationCode = req.query.destination || "RIO";
    const mode = req.query.mode || "money";
    const monthStr = req.query.month || new Date().toISOString().slice(0, 7);
    const [year, month] = monthStr.split("-").map(Number);
    const monthDate = new Date(year, (month || 1) - 1, 1);

    const prices = generateMockMonthPrices({
      originCode,
      destinationCode,
      mode,
      month: monthDate,
    });

    return res.json(prices);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erro ao obter preços" });
  }
});

export default router;
