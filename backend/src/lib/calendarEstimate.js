/** Estimativa quando não há linha em `calendar_prices` (alinhado a `src/lib/price-calendar.ts`). */

function getMonthDays(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  return new Date(year, month + 1, 0).getDate();
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function hash(value) {
  let output = 0;
  for (let i = 0; i < value.length; i += 1) {
    output = (output << 5) - output + value.charCodeAt(i);
    output |= 0;
  }
  return Math.abs(output);
}

/**
 * @param {{ originCode: string; destinationCode: string; mode: 'money'|'points'; month: Date }} params
 * @returns {Record<number, number>} dia do mês → preço (objeto JSON, não Map)
 */
export function generateEstimatedMonthPrices({ originCode, destinationCode, mode, month }) {
  const totalDays = getMonthDays(month);
  const monthToken = monthKey(month);
  /** @type {Record<number, number>} */
  const out = {};

  for (let day = 1; day <= totalDays; day += 1) {
    const seed = hash(`${originCode}-${destinationCode}-${mode}-${monthToken}-${day}`);
    if (seed % 9 === 0) continue;

    if (mode === "points") {
      const value = 3500 + (seed % 17000);
      out[day] = Math.round(value / 100) * 100;
    } else {
      out[day] = Math.round(220 + (seed % 1700));
    }
  }

  return out;
}
