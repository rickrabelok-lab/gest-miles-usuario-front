import { apiFetch, hasApiUrl } from "./api";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { DemoFlight } from "@/lib/api-contracts";
import { addDays } from "date-fns";
import type { ScheduledFlight, DatePrice, PaymentOption } from "@/lib/flight-types";

const FLIGHT_SCHEDULES = [
  { dep: "06:40", arr: "07:45", duration: 65,  stops: 0 },
  { dep: "08:50", arr: "09:55", duration: 65,  stops: 0 },
  { dep: "10:00", arr: "12:30", duration: 150, stops: 1 },
  { dep: "12:05", arr: "13:10", duration: 65,  stops: 0 },
  { dep: "13:05", arr: "14:10", duration: 65,  stops: 0 },
  { dep: "14:20", arr: "16:00", duration: 100, stops: 0 },
  { dep: "15:25", arr: "16:30", duration: 65,  stops: 0 },
  { dep: "15:40", arr: "16:50", duration: 70,  stops: 0 },
  { dep: "17:00", arr: "19:30", duration: 150, stops: 1 },
  { dep: "18:30", arr: "19:35", duration: 65,  stops: 0 },
] as const;

const AIRLINE_CYCLE  = ["GOL","GOL","LATAM","GOL","GOL","Azul","GOL","GOL","LATAM","Azul"];
const BASE_POINTS: Record<string, number> = { GOL: 6100,   LATAM: 13986, Azul: 10000 };
const BASE_MONEY:  Record<string, number> = { GOL: 107.90, LATAM: 409.39, Azul: 453.73 };

type DemoFlightRow = {
  external_id?: string;
  id?: string;
  origin_code: string;
  destination_code: string;
  origin_name: string;
  destination_name: string;
  airline: string;
  points: number;
  money: number;
};

function mapDemoFlightRow(row: DemoFlightRow): DemoFlight {
  return {
    id: String(row.external_id ?? row.id ?? ""),
    originCode: row.origin_code,
    destinationCode: row.destination_code,
    origin: row.origin_name,
    destination: row.destination_name,
    airline: row.airline,
    points: Number(row.points),
    money: Number(row.money),
  };
}

export async function fetchDemoFlights(destinationCode?: string | null): Promise<DemoFlight[]> {
  if (hasApiUrl()) {
    const qs = destinationCode
      ? `?destination=${encodeURIComponent(destinationCode)}`
      : "";
    const data = await apiFetch<DemoFlight[]>(`/api/demo-flights${qs}`);
    return Array.isArray(data) ? data : [];
  }

  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from("demo_flights")
      .select("*")
      .order("external_id");
    if (error) return [];
    const rows = (data ?? []) as DemoFlightRow[];
    const mapped = rows.map(mapDemoFlightRow);
    if (destinationCode) {
      const d = destinationCode.toUpperCase();
      const matches = mapped.filter((f) => f.destinationCode.toUpperCase() === d);
      return (matches.length > 0 ? matches : mapped).slice(0, 6);
    }
    return mapped.slice(0, 6);
  }

  return [];
}

export function generateFlightSchedule(
  fromCode: string,
  toCode: string,
  _date: Date,
): ScheduledFlight[] {
  return FLIGHT_SCHEDULES.map((s, i) => {
    const airline = AIRLINE_CYCLE[i];
    return {
      id: `${fromCode}-${toCode}-${i}`,
      airline,
      flightNumber: `${airline.substring(0, 2).toUpperCase()}${1100 + i}`,
      originCode: fromCode,
      destinationCode: toCode,
      departureTime: s.dep,
      arrivalTime: s.arr,
      durationMinutes: s.duration,
      stops: s.stops,
      points: (BASE_POINTS[airline] ?? 8000) + i * 100,
      money: parseFloat(((BASE_MONEY[airline] ?? 200) + i * 8).toFixed(2)),
    };
  });
}

export function generateDatePrices(
  fromCode: string,
  toCode: string,
  centerDate: Date,
): DatePrice[] {
  const prices = [-3, -2, -1, 0, 1, 2, 3].map((offset) => ({
    date: addDays(centerDate, offset),
    cheapestMoney:
      offset <= -3
        ? null
        : parseFloat(
            (107.9 + Math.abs(offset) * 9 - (offset === -1 ? 5 : 0)).toFixed(2),
          ),
    isCheapest: false,
  }));
  const valid = prices.filter((p) => p.cheapestMoney !== null);
  const min = Math.min(...valid.map((p) => p.cheapestMoney!));
  return prices.map((p) => ({ ...p, isCheapest: p.cheapestMoney === min }));
}

export function generatePaymentOptions(
  totalPoints: number,
  totalMoney: number,
): PaymentOption[] {
  return [
    {
      id: "full-points",
      points: totalPoints,
      money: 0,
      label: "Somente pontos, sem custo extra",
    },
    {
      id: "mixed-70-30",
      points: Math.round(totalPoints * 0.7),
      money: parseFloat((totalMoney * 0.3).toFixed(2)),
      label: "Economize pontos pagando um pouco",
    },
    {
      id: "mixed-36-64",
      points: Math.round(totalPoints * 0.36),
      money: parseFloat((totalMoney * 0.64).toFixed(2)),
      label: "Menos pontos, mais dinheiro",
    },
    {
      id: "mixed-18-82",
      points: Math.round(totalPoints * 0.18),
      money: parseFloat((totalMoney * 0.82).toFixed(2)),
      label: "Mínimo de pontos necessário",
    },
  ];
}
