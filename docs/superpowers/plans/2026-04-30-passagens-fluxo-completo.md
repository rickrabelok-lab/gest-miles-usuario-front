# Passagens — Fluxo Completo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o `/price-calendar` por 4 telas encadeadas (busca → resultados → detalhes → compra) com design premium roxo Gest Miles, mais uma feature flag para emissão futura via Gest Miles.

**Architecture:** `SearchFlightsScreen` redesenhada navega para `FlightResultsScreen` (nova) que encadeia `EmissionDetailsScreen` (nova) → `PurchaseOptionsScreen` (nova) via React Router `navigate(path, { state })`. Dados de voo são gerados por helpers síncronos em `demoFlightsService.ts` — sem nova API. Feature flag `GESTMILES_EMISSION_ENABLED` em `src/config/features.ts` controla o card de emissão futuro.

**Tech Stack:** React 18 + TypeScript, React Router v6, Tailwind CSS (classes nubank-*), shadcn/ui (Drawer, Calendar, Button, Input, Skeleton), lucide-react, date-fns + ptBR locale, react-day-picker v9 (via shadcn Calendar).

---

## File Map

| Ação | Arquivo | Responsabilidade |
|------|---------|-----------------|
| Criar | `src/config/features.ts` | Feature flags (GESTMILES_EMISSION_ENABLED) |
| Criar | `src/lib/flight-types.ts` | Tipos compartilhados entre as 4 telas |
| Modificar | `src/services/demoFlightsService.ts` | Adicionar `generateFlightSchedule`, `generateDatePrices`, `generatePaymentOptions` |
| Modificar | `src/pages/SearchFlightsScreen.tsx` | Redesign completo da tela de busca |
| Criar | `src/pages/FlightResultsScreen.tsx` | Resultados + tabs ida/volta + PaymentOptionsDrawer |
| Criar | `src/pages/EmissionDetailsScreen.tsx` | Detalhes IDA/VOLTA/TOTAL + breakdown |
| Criar | `src/pages/PurchaseOptionsScreen.tsx` | Opções de compra (site cia + placeholder GM) |
| Modificar | `src/App.tsx` | Adicionar 3 novas rotas |

---

## Task 1: Feature flags e tipos compartilhados

**Files:**
- Create: `src/config/features.ts`
- Create: `src/lib/flight-types.ts`

- [ ] **Step 1.1 — Criar `src/config/features.ts`**

```ts
// Mude para true quando implementar a emissão via Gest Miles
export const GESTMILES_EMISSION_ENABLED = false
```

- [ ] **Step 1.2 — Criar `src/lib/flight-types.ts`**

```ts
export interface ScheduledFlight {
  id: string
  airline: string
  flightNumber: string
  originCode: string
  destinationCode: string
  departureTime: string   // "06:40"
  arrivalTime: string     // "07:45"
  durationMinutes: number
  stops: number
  points: number
  money: number
}

export interface DatePrice {
  date: Date
  cheapestMoney: number | null
  isCheapest: boolean
}

export interface PaymentOption {
  id: string
  points: number
  money: number
  label: string
}

export interface EmissionFlightState {
  from: string
  fromName: string
  to: string
  toName: string
  departureFlight: ScheduledFlight
  returnFlight: ScheduledFlight | null
  departureDate: string   // "yyyy-MM-dd"
  returnDate: string | null
  paymentOption: PaymentOption
  passengers: number
}
```

- [ ] **Step 1.3 — Verificar tipos**

```bash
cd "C:/Users/rick_/OneDrive/Área de Trabalho/Gest Miles/gest-miles-usuario-front"
npx tsc --noEmit
```

Esperado: sem erros novos.

- [ ] **Step 1.4 — Commit**

```bash
git add src/config/features.ts src/lib/flight-types.ts
git commit -m "feat: feature flags e tipos compartilhados de voo"
```

---

## Task 2: Estender demoFlightsService com dados de horário

**Files:**
- Modify: `src/services/demoFlightsService.ts`

- [ ] **Step 2.1 — Adicionar imports e constantes no topo do arquivo**

Abra `src/services/demoFlightsService.ts` e adicione no topo (após os imports existentes):

```ts
import { addDays } from "date-fns"
import type { ScheduledFlight, DatePrice, PaymentOption } from "@/lib/flight-types"

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
] as const

const AIRLINE_CYCLE  = ["GOL","GOL","LATAM","GOL","GOL","Azul","GOL","GOL","LATAM","Azul"]
const BASE_POINTS: Record<string, number> = { GOL: 6100,   LATAM: 13986, Azul: 10000 }
const BASE_MONEY:  Record<string, number> = { GOL: 107.90, LATAM: 409.39, Azul: 453.73 }
```

- [ ] **Step 2.2 — Adicionar as três funções exportadas no final do arquivo**

```ts
export function generateFlightSchedule(
  fromCode: string,
  toCode: string,
  _date: Date,
): ScheduledFlight[] {
  return FLIGHT_SCHEDULES.map((s, i) => {
    const airline = AIRLINE_CYCLE[i]
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
    }
  })
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
  }))
  const valid = prices.filter((p) => p.cheapestMoney !== null)
  const min = Math.min(...valid.map((p) => p.cheapestMoney!))
  return prices.map((p) => ({ ...p, isCheapest: p.cheapestMoney === min }))
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
  ]
}
```

- [ ] **Step 2.3 — Verificar tipos**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 2.4 — Commit**

```bash
git add src/services/demoFlightsService.ts
git commit -m "feat: adicionar geradores de horário de voo, preços por data e opções de pagamento"
```

---

## Task 3: Redesign completo de SearchFlightsScreen

**Files:**
- Modify: `src/pages/SearchFlightsScreen.tsx` (rewrite total)

- [ ] **Step 3.1 — Substituir todo o conteúdo de `src/pages/SearchFlightsScreen.tsx`**

```tsx
import {
  ArrowLeft,
  ArrowLeftRight,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Minus,
  Plus,
  Search,
  X,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/contexts/AuthContext"
import { useSearchFlights } from "@/contexts/SearchFlightsContext"
import BottomNav from "@/components/BottomNav"
import DestinationCarousel from "@/components/DestinationCarousel"
import {
  AIRPORTS,
  findAirportByCode,
  formatAirportLabel,
  type AirportOption,
} from "@/lib/airports"

const AIRLINES = [
  { id: "GOL",      label: "GOL",      color: "#e87722" },
  { id: "LATAM",    label: "LATAM",    color: "#d42054" },
  { id: "Azul",     label: "Azul",     color: "#0050b3" },
  { id: "TAP",      label: "TAP",      color: "#7c3aed" },
  { id: "American", label: "American", color: "#c0392b" },
]

const MONTH_OPTIONS = [
  "Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez","Jan","Fev",
]

const BRAZIL_NATIONAL_HOLIDAYS = [
  "Confraternização","Tiradentes","Trabalho","Independência",
  "Aparecida","Finados","República","Consciência Negra","Natal",
]

const SearchFlightsScreen = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { role } = useAuth()
  const isGestor = role === "gestor" || role === "admin"

  const {
    origin, destination, passengers, cabinClass,
    setOrigin, setDestination, swapOriginDestination,
    setPassengerCount, setCabinClass,
  } = useSearchFlights()

  // New state
  const [tripType, setTripType]       = useState<"roundtrip" | "oneway">("roundtrip")
  const [departureDate, setDepartureDate] = useState<Date | null>(null)
  const [returnDate, setReturnDate]   = useState<Date | null>(null)
  const [paymentMode, setPaymentMode] = useState<"both" | "points" | "money">("both")
  const [selectedAirlines, setSelectedAirlines] = useState<string[]>(
    AIRLINES.map((a) => a.id),
  )

  // Drawer state
  const [airportPickerTarget, setAirportPickerTarget] = useState<
    "origin" | "destination" | null
  >(null)
  const [airportQuery, setAirportQuery]         = useState("")
  const [isPassengersDrawerOpen, setIsPassengersDrawerOpen] = useState(false)
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)
  const [datePickerTarget, setDatePickerTarget] = useState<"departure" | "return">("departure")
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(false)
  const [selectedMonths,   setSelectedMonths]   = useState<string[]>([])
  const [selectedHolidays, setSelectedHolidays] = useState<string[]>([])

  // Drag-scroll refs (meses)
  const monthsScrollRef = useRef<HTMLDivElement | null>(null)
  const ignoreTapRef    = useRef(false)
  const dragMetaRef     = useRef({ isDown: false, startX: 0, startScrollLeft: 0 })

  useEffect(() => {
    const code    = searchParams.get("destination")
    const airport = findAirportByCode(code)
    if (airport) setDestination(airport)
  }, [searchParams, setDestination])

  const filteredAirports = useMemo(() => {
    const q = airportQuery.trim().toLowerCase()
    if (!q) return []
    return AIRPORTS.filter((a) =>
      `${a.city} ${a.code} ${a.name} ${a.country}`.toLowerCase().includes(q),
    ).slice(0, 30)
  }, [airportQuery])

  const passengerSummary = useMemo(() => {
    const parts: string[] = []
    if (passengers.adult > 0) parts.push(`${passengers.adult} adulto${passengers.adult > 1 ? "s" : ""}`)
    if (passengers.child > 0) parts.push(`${passengers.child} criança${passengers.child > 1 ? "s" : ""}`)
    if (passengers.baby  > 0) parts.push(`${passengers.baby} bebê${passengers.baby > 1 ? "s" : ""}`)
    return parts.length > 0 ? parts.join(", ") : "Passageiros"
  }, [passengers])

  const selectAirport = (airport: AirportOption) => {
    if (airportPickerTarget === "origin")      setOrigin(airport)
    else if (airportPickerTarget === "destination") setDestination(airport)
    setAirportPickerTarget(null)
    setAirportQuery("")
  }

  const toggleAirline = (id: string) =>
    setSelectedAirlines((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id],
    )

  const toggleArrayItem = (
    value: string,
    items: string[],
    setter: (n: string[]) => void,
  ) => setter(items.includes(value) ? items.filter((i) => i !== value) : [...items, value])

  const openDatePicker = (target: "departure" | "return") => {
    setDatePickerTarget(target)
    setIsDatePickerOpen(true)
  }

  const handleDateSelect = (day: Date | undefined) => {
    if (!day) return
    if (datePickerTarget === "departure") {
      setDepartureDate(day)
      if (returnDate && returnDate < day) setReturnDate(null)
    } else {
      setReturnDate(day)
    }
    setIsDatePickerOpen(false)
  }

  const handleSearch = () => {
    if (!origin || !destination) return
    const params = new URLSearchParams({
      from:     origin.code,
      to:       destination.code,
      fromName: formatAirportLabel(origin),
      toName:   formatAirportLabel(destination),
      mode:     paymentMode,
      airlines: selectedAirlines.join(","),
    })
    if (departureDate) params.set("dep", format(departureDate, "yyyy-MM-dd"))
    if (returnDate && tripType === "roundtrip")
      params.set("ret", format(returnDate, "yyyy-MM-dd"))
    navigate(`/flight-results?${params.toString()}`)
  }

  const handleDestinationCardClick = ({ code, name }: { code: string; name: string }) => {
    const airport = findAirportByCode(code) ?? ({
      code, city: name, name, country: "Brasil", lat: 0, lng: 0,
    } as AirportOption)
    setDestination(airport)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const canSearch = !!origin && !!destination

  const fmt = (date: Date | null) =>
    date ? format(date, "dd MMM yyyy", { locale: ptBR }) : null
  const fmtDay = (date: Date | null) =>
    date ? format(date, "EEEE", { locale: ptBR }) : null

  return (
    <div className="min-h-screen bg-nubank-bg">
      <header className="sticky top-0 z-40 border-b border-nubank-border bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="-ml-1 flex h-9 w-9 items-center justify-center rounded-full text-nubank-text-secondary hover:bg-nubank-bg"
          >
            <ArrowLeft size={20} strokeWidth={1.5} />
          </button>
          <h1 className="text-base font-semibold tracking-tight text-nubank-text">
            Passagens
          </h1>
          <div className="w-9" />
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 pb-44 pt-5">
        <div className="space-y-3">

          {/* Trip type */}
          <div className="flex rounded-[14px] bg-white p-1 shadow-nubank">
            {(["roundtrip", "oneway"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => { setTripType(type); if (type === "oneway") setReturnDate(null) }}
                className={`flex-1 rounded-[10px] py-2.5 text-sm font-medium transition-all ${
                  tripType === type
                    ? "bg-nubank-primary text-white shadow-sm"
                    : "text-nubank-text-secondary hover:text-nubank-text"
                }`}
              >
                {type === "roundtrip" ? "✈ Ida e volta" : "→ Somente ida"}
              </button>
            ))}
          </div>

          {/* Route */}
          <div className="relative rounded-[18px] bg-white px-4 shadow-nubank">
            <button
              type="button"
              onClick={() => setAirportPickerTarget("origin")}
              className="flex w-full items-center gap-3 py-3.5"
            >
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] bg-purple-50 text-nubank-primary">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                </svg>
              </div>
              <div className="flex-1 text-left">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-nubank-text-secondary">Origem</p>
                <p className={`mt-0.5 text-[15px] font-semibold ${origin ? "text-nubank-text" : "text-nubank-border"}`}>
                  {origin ? formatAirportLabel(origin) : "De onde você sai?"}
                </p>
              </div>
            </button>

            <div className="h-px bg-nubank-border" />

            <button
              type="button"
              onClick={() => setAirportPickerTarget("destination")}
              className="flex w-full items-center gap-3 py-3.5"
            >
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] bg-green-50 text-green-600">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
              </div>
              <div className="flex-1 text-left">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-nubank-text-secondary">Destino</p>
                <p className={`mt-0.5 text-[15px] font-semibold ${destination ? "text-nubank-text" : "text-nubank-border"}`}>
                  {destination ? formatAirportLabel(destination) : "Para onde?"}
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={swapOriginDestination}
              aria-label="Trocar origem e destino"
              className="absolute right-4 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full border border-nubank-border bg-white text-nubank-primary shadow-sm hover:bg-purple-50"
            >
              <ArrowLeftRight size={15} strokeWidth={2} />
            </button>
          </div>

          {/* Dates */}
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => openDatePicker("departure")}
              className="flex-1 rounded-[14px] bg-white px-4 py-3 text-left shadow-nubank"
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-nubank-text-secondary">✈ Ida</p>
              {departureDate ? (
                <>
                  <p className="mt-1 text-[14px] font-semibold text-nubank-text">{fmt(departureDate)}</p>
                  <p className="mt-0.5 text-[11px] capitalize text-nubank-text-secondary">{fmtDay(departureDate)}</p>
                </>
              ) : (
                <p className="mt-1 text-[13px] font-medium text-nubank-border">Selecionar data</p>
              )}
            </button>

            {tripType === "roundtrip" && (
              <button
                type="button"
                onClick={() => openDatePicker("return")}
                className={`flex-1 rounded-[14px] bg-white px-4 py-3 text-left shadow-nubank ${
                  returnDate ? "border border-nubank-primary" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className={`text-[10px] font-semibold uppercase tracking-wider ${
                    returnDate ? "text-nubank-primary" : "text-nubank-text-secondary"
                  }`}>↩ Volta</p>
                  {returnDate && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setReturnDate(null) }}
                      className="text-nubank-text-secondary hover:text-nubank-text"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
                {returnDate ? (
                  <>
                    <p className="mt-1 text-[14px] font-semibold text-nubank-text">{fmt(returnDate)}</p>
                    <p className="mt-0.5 text-[11px] capitalize text-nubank-primary">{fmtDay(returnDate)}</p>
                  </>
                ) : (
                  <p className="mt-1 text-[13px] font-medium text-nubank-border">Selecionar data</p>
                )}
              </button>
            )}
          </div>

          {/* Passengers */}
          <button
            type="button"
            onClick={() => setIsPassengersDrawerOpen(true)}
            className="flex w-full items-center justify-between rounded-[14px] bg-white px-4 py-3.5 shadow-nubank hover:bg-nubank-bg"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">👤</span>
              <div className="text-left">
                <p className="text-[14px] font-semibold text-nubank-text">{passengerSummary}</p>
                <p className="text-[11px] capitalize text-nubank-text-secondary">
                  {cabinClass === "executiva" ? "Executiva" : "Econômica"}
                </p>
              </div>
            </div>
            <ChevronRight size={18} className="text-nubank-border" strokeWidth={1.5} />
          </button>

          {/* Payment mode */}
          <div>
            <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-nubank-text-secondary">
              Forma de pagamento
            </p>
            <div className="flex rounded-[14px] bg-white p-1 shadow-nubank">
              {([
                { id: "both",   label: "Pts + R$" },
                { id: "points", label: "Pontos"   },
                { id: "money",  label: "Dinheiro"  },
              ] as const).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPaymentMode(m.id)}
                  className={`flex-1 rounded-[10px] py-2.5 text-[12px] font-medium transition-all ${
                    paymentMode === m.id
                      ? "bg-nubank-primary text-white font-semibold shadow-sm"
                      : "text-nubank-text-secondary"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Airlines */}
          <div>
            <div className="mb-1.5 flex items-center justify-between px-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-nubank-text-secondary">
                Companhias Aéreas
              </p>
              <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-nubank-primary">
                {selectedAirlines.length} selecionada{selectedAirlines.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {AIRLINES.map((airline) => {
                const active = selectedAirlines.includes(airline.id)
                return (
                  <button
                    key={airline.id}
                    type="button"
                    onClick={() => toggleAirline(airline.id)}
                    className={`flex items-center gap-1.5 rounded-[10px] border px-3 py-2 text-[12px] font-medium transition-all ${
                      active
                        ? "border-nubank-primary bg-purple-50 text-nubank-primary"
                        : "border-nubank-border bg-white text-nubank-text-secondary"
                    }`}
                  >
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: active ? airline.color : "#d1c4e0" }}
                    />
                    {airline.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Advanced filters */}
          <div>
            <button
              type="button"
              onClick={() => setIsAdvancedFiltersOpen((p) => !p)}
              className="flex w-full items-center justify-between rounded-[14px] bg-white px-4 py-3 shadow-nubank hover:bg-nubank-bg"
            >
              <span className="text-sm font-medium text-nubank-text-secondary">Filtros avançados</span>
              {isAdvancedFiltersOpen
                ? <ChevronUp size={17} className="text-nubank-border" strokeWidth={1.5} />
                : <ChevronDown size={17} className="text-nubank-border" strokeWidth={1.5} />
              }
            </button>

            {isAdvancedFiltersOpen && (
              <div className="mt-2 space-y-4 rounded-[14px] bg-white p-4 shadow-nubank">
                <div>
                  <p className="mb-2 text-xs font-medium text-nubank-text-secondary">Classe</p>
                  <div className="flex gap-2">
                    {[
                      { id: "economica", label: "Econômica" },
                      { id: "executiva", label: "Executiva" },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setCabinClass(opt.id as typeof cabinClass)}
                        className={`rounded-[10px] px-3 py-1.5 text-xs font-medium transition-colors ${
                          cabinClass === opt.id
                            ? "bg-nubank-primary text-white"
                            : "bg-nubank-bg text-nubank-text-secondary"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium text-nubank-text-secondary">Período</p>
                  <div
                    ref={monthsScrollRef}
                    className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide"
                    onPointerDown={(e) => {
                      if (!monthsScrollRef.current) return
                      dragMetaRef.current = {
                        isDown: true,
                        startX: e.clientX,
                        startScrollLeft: monthsScrollRef.current.scrollLeft,
                      }
                      ignoreTapRef.current = false
                    }}
                    onPointerMove={(e) => {
                      if (!dragMetaRef.current.isDown || !monthsScrollRef.current) return
                      const dx = e.clientX - dragMetaRef.current.startX
                      if (Math.abs(dx) > 6) ignoreTapRef.current = true
                      monthsScrollRef.current.scrollLeft =
                        dragMetaRef.current.startScrollLeft - dx
                    }}
                    onPointerUp={() => {
                      dragMetaRef.current.isDown = false
                      if (ignoreTapRef.current)
                        setTimeout(() => { ignoreTapRef.current = false }, 120)
                    }}
                    onPointerCancel={() => { dragMetaRef.current.isDown = false }}
                  >
                    {MONTH_OPTIONS.map((month) => (
                      <button
                        key={month}
                        type="button"
                        onClick={() => {
                          if (ignoreTapRef.current) return
                          toggleArrayItem(month, selectedMonths, setSelectedMonths)
                        }}
                        className={`shrink-0 rounded-[10px] px-2.5 py-1.5 text-xs font-medium ${
                          selectedMonths.includes(month)
                            ? "bg-nubank-primary text-white"
                            : "bg-nubank-bg text-nubank-text-secondary"
                        }`}
                      >
                        {month}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium text-nubank-text-secondary">Feriados</p>
                  <div className="flex flex-wrap gap-1.5">
                    {BRAZIL_NATIONAL_HOLIDAYS.map((holiday) => (
                      <button
                        key={holiday}
                        type="button"
                        onClick={() => toggleArrayItem(holiday, selectedHolidays, setSelectedHolidays)}
                        className={`rounded-[10px] px-2.5 py-1.5 text-[11px] font-medium ${
                          selectedHolidays.includes(holiday)
                            ? "bg-nubank-primary text-white"
                            : "bg-nubank-bg text-nubank-text-secondary"
                        }`}
                      >
                        {holiday}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Destinos */}
          <div className="pt-2">
            <div className="mb-3 flex items-center">
              <div className="h-px flex-1 bg-nubank-border" />
              <span className="mx-3 text-[10px] font-semibold uppercase tracking-wider text-nubank-text-secondary">
                Explorar destinos
              </span>
              <div className="h-px flex-1 bg-nubank-border" />
            </div>
            <DestinationCarousel
              origins={origin ? [origin.code] : []}
              onDestinationClick={handleDestinationCardClick}
            />
          </div>

        </div>
      </main>

      {/* Fixed CTA */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex flex-col border-t border-nubank-border bg-white/95 backdrop-blur-sm">
        <div className="mx-auto w-full max-w-md px-4 pt-3 pb-2">
          <Button
            disabled={!canSearch}
            onClick={handleSearch}
            className="h-13 w-full rounded-[16px] text-[15px] font-semibold text-white shadow-lg disabled:opacity-40"
            style={{ background: canSearch ? "linear-gradient(135deg,#8A05BE,#9E2FD4)" : "#d1c4e0" }}
          >
            <Search size={17} className="mr-2" strokeWidth={2.5} />
            Pesquisar passagens
          </Button>
        </div>
        <BottomNav showClientSelector={isGestor} clients={[]} />
      </div>

      {/* Airport Drawer */}
      <Drawer
        open={airportPickerTarget !== null}
        onOpenChange={(open) => { if (!open) { setAirportPickerTarget(null); setAirportQuery("") } }}
      >
        <DrawerContent className="mx-auto max-h-[85vh] w-full max-w-md rounded-t-2xl border-0 bg-white">
          <DrawerHeader className="text-left">
            <DrawerTitle className="text-base font-semibold text-nubank-text">
              {airportPickerTarget === "origin" ? "Origem" : "Destino"}
            </DrawerTitle>
            <DrawerDescription className="text-sm text-nubank-text-secondary">
              Busque por cidade, aeroporto ou código IATA
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-6">
            <Input
              value={airportQuery}
              placeholder="Ex: São Paulo, GRU, Lisboa..."
              onChange={(e) => setAirportQuery(e.target.value)}
              className="rounded-[12px] border-nubank-border"
              autoFocus
            />
            <div className="mt-3 max-h-[45vh] space-y-1 overflow-y-auto">
              {filteredAirports.length === 0 && airportQuery.trim() && (
                <p className="py-4 text-center text-sm text-nubank-text-secondary">
                  Nenhum aeroporto encontrado
                </p>
              )}
              {filteredAirports.map((airport) => (
                <button
                  key={airport.code}
                  type="button"
                  onClick={() => selectAirport(airport)}
                  className="flex w-full items-center justify-between rounded-[12px] border border-nubank-border bg-nubank-bg/50 px-3 py-2.5 text-left hover:bg-nubank-bg"
                >
                  <div>
                    <p className="text-sm font-semibold text-nubank-text">
                      {airport.city} – {airport.code}
                    </p>
                    <p className="text-xs text-nubank-text-secondary">{airport.name}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Passengers Drawer */}
      <Drawer open={isPassengersDrawerOpen} onOpenChange={setIsPassengersDrawerOpen}>
        <DrawerContent className="mx-auto max-h-[75vh] w-full max-w-md rounded-t-2xl border-0 bg-white">
          <DrawerHeader className="text-left">
            <DrawerTitle className="text-base font-semibold text-nubank-text">
              Passageiros e Classe
            </DrawerTitle>
            <DrawerDescription className="text-sm text-nubank-text-secondary">
              Quantidade e tipo de cabine
            </DrawerDescription>
          </DrawerHeader>
          <div className="space-y-3 px-4 pb-6">
            {([
              { key: "adult" as const, label: "Adultos",  sub: "+18 anos",         min: 1 },
              { key: "child" as const, label: "Crianças", sub: "2 a 11 anos",       min: 0 },
              { key: "baby"  as const, label: "Bebês",    sub: "Menos de 2 anos",   min: 0 },
            ]).map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between rounded-[14px] border border-nubank-border bg-nubank-bg/30 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-nubank-text">{item.label}</p>
                  <p className="text-xs text-nubank-text-secondary">{item.sub}</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setPassengerCount(item.key, Math.max(item.min, passengers[item.key] - 1))
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-nubank-border bg-white text-nubank-text-secondary hover:bg-nubank-bg"
                  >
                    <Minus size={14} strokeWidth={2} />
                  </button>
                  <span className="w-6 text-center text-sm font-bold text-nubank-text">
                    {passengers[item.key]}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPassengerCount(item.key, passengers[item.key] + 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-nubank-border bg-white text-nubank-text-secondary hover:bg-nubank-bg"
                  >
                    <Plus size={14} strokeWidth={2} />
                  </button>
                </div>
              </div>
            ))}
            <div className="rounded-[14px] border border-nubank-border bg-nubank-bg/30 px-4 py-3">
              <p className="mb-2 text-sm font-semibold text-nubank-text">Classe</p>
              <div className="flex gap-2">
                {[
                  { id: "economica", label: "Econômica" },
                  { id: "executiva", label: "Executiva" },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setCabinClass(opt.id as typeof cabinClass)}
                    className={`flex-1 rounded-[10px] py-2 text-sm font-medium transition-colors ${
                      cabinClass === opt.id
                        ? "bg-nubank-primary text-white"
                        : "border border-nubank-border bg-white text-nubank-text-secondary"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Date Picker Drawer */}
      <Drawer open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
        <DrawerContent className="mx-auto max-h-[85vh] w-full max-w-md rounded-t-2xl border-0 bg-white">
          <DrawerHeader className="text-left">
            <DrawerTitle className="text-base font-semibold text-nubank-text">
              {datePickerTarget === "departure" ? "Data de ida" : "Data de volta"}
            </DrawerTitle>
            <DrawerDescription className="text-sm text-nubank-text-secondary">
              Selecione a data da viagem
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex justify-center px-4 pb-6">
            <Calendar
              mode="single"
              selected={
                datePickerTarget === "departure"
                  ? (departureDate ?? undefined)
                  : (returnDate ?? undefined)
              }
              onSelect={handleDateSelect}
              disabled={
                datePickerTarget === "return" && departureDate
                  ? { before: departureDate }
                  : { before: new Date() }
              }
              locale={ptBR}
              className="rounded-[14px]"
            />
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  )
}

export default SearchFlightsScreen
```

- [ ] **Step 3.2 — Verificar compilação**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 3.3 — Commit**

```bash
git add src/pages/SearchFlightsScreen.tsx
git commit -m "feat: redesign completo do SearchFlightsScreen com trip type, datas, cias e modo pagamento"
```

---

## Task 4: Criar FlightResultsScreen

**Files:**
- Create: `src/pages/FlightResultsScreen.tsx`

- [ ] **Step 4.1 — Criar `src/pages/FlightResultsScreen.tsx`**

```tsx
import { useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ArrowLeft, Check, SlidersHorizontal } from "lucide-react"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer"
import BottomNav from "@/components/BottomNav"
import { useAuth } from "@/contexts/AuthContext"
import {
  generateFlightSchedule,
  generateDatePrices,
  generatePaymentOptions,
} from "@/services/demoFlightsService"
import type { ScheduledFlight, PaymentOption, EmissionFlightState } from "@/lib/flight-types"

const AIRLINE_COLORS: Record<string, { bg: string; text: string }> = {
  GOL:   { bg: "#fff4ed", text: "#e87722" },
  LATAM: { bg: "#fff0f3", text: "#d42054" },
  Azul:  { bg: "#eef4ff", text: "#0050b3" },
}

const fmtMoney  = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const fmtPoints = (v: number) => v.toLocaleString("pt-BR")
const fmtDur    = (min: number) => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m`

export default function FlightResultsScreen() {
  const navigate   = useNavigate()
  const { role }   = useAuth()
  const isGestor   = role === "gestor" || role === "admin"
  const [searchParams] = useSearchParams()

  const fromCode = searchParams.get("from")     ?? "SAO"
  const toCode   = searchParams.get("to")       ?? "CWB"
  const fromName = searchParams.get("fromName") ?? fromCode
  const toName   = searchParams.get("toName")   ?? toCode
  const depStr   = searchParams.get("dep")
  const retStr   = searchParams.get("ret")

  const depDate    = depStr ? parseISO(depStr) : new Date()
  const retDate    = retStr ? parseISO(retStr) : null
  const isRoundtrip = !!retDate

  const [activeTab,            setActiveTab]            = useState<"ida" | "volta">("ida")
  const [selectedDate,         setSelectedDate]         = useState<Date>(depDate)
  const [sortBy,               setSortBy]               = useState<"time" | "points" | "money">("money")
  const [selectedDepartFlight, setSelectedDepartFlight] = useState<ScheduledFlight | null>(null)
  const [selectedReturnFlight, setSelectedReturnFlight] = useState<ScheduledFlight | null>(null)
  const [isPaymentDrawerOpen,  setIsPaymentDrawerOpen]  = useState(false)
  const [selectedPayment,      setSelectedPayment]      = useState<PaymentOption | null>(null)

  const datePrices = useMemo(
    () => generateDatePrices(fromCode, toCode, activeTab === "ida" ? depDate : (retDate ?? depDate)),
    [fromCode, toCode, activeTab],
  )

  const currentFlights = useMemo(() => {
    const isReturn = activeTab === "volta"
    const from = isReturn ? toCode : fromCode
    const to   = isReturn ? fromCode : toCode
    const date = isReturn ? (retDate ?? depDate) : selectedDate
    return [...generateFlightSchedule(from, to, date)].sort((a, b) => {
      if (sortBy === "points") return a.points - b.points
      if (sortBy === "money")  return a.money  - b.money
      return a.departureTime.localeCompare(b.departureTime)
    })
  }, [activeTab, fromCode, toCode, selectedDate, retDate, depDate, sortBy])

  const airlineSummary = useMemo(() => {
    const flights = generateFlightSchedule(fromCode, toCode, selectedDate)
    const map = new Map<string, { points: number; money: number }>()
    for (const f of flights) {
      const ex = map.get(f.airline)
      if (!ex || f.money < ex.money) map.set(f.airline, { points: f.points, money: f.money })
    }
    const entries = Array.from(map.entries()).map(([airline, p]) => ({ airline, ...p }))
    const minMoney = Math.min(...entries.map((e) => e.money))
    return entries.map((e) => ({ ...e, isCheapest: e.money === minMoney }))
  }, [fromCode, toCode, selectedDate])

  const paymentOptions = useMemo(
    () => (selectedDepartFlight ? generatePaymentOptions(selectedDepartFlight.points, selectedDepartFlight.money) : []),
    [selectedDepartFlight],
  )

  const bestValueId = useMemo(
    () => (currentFlights.length ? [...currentFlights].sort((a, b) => a.money - b.money)[0].id : null),
    [currentFlights],
  )

  const handleFlightSelect = (flight: ScheduledFlight) => {
    if (activeTab === "ida") {
      setSelectedDepartFlight(flight)
      if (isRoundtrip) setActiveTab("volta")
      else setIsPaymentDrawerOpen(true)
    } else {
      setSelectedReturnFlight(flight)
      setIsPaymentDrawerOpen(true)
    }
  }

  const handleConfirmPayment = () => {
    if (!selectedPayment || !selectedDepartFlight) return
    const state: EmissionFlightState = {
      from: fromCode, fromName,
      to: toCode, toName,
      departureFlight: selectedDepartFlight,
      returnFlight: selectedReturnFlight,
      departureDate: depStr ?? format(depDate, "yyyy-MM-dd"),
      returnDate: retStr ?? null,
      paymentOption: selectedPayment,
      passengers: 1,
    }
    navigate("/emission-details", { state })
  }

  return (
    <div className="min-h-screen bg-nubank-bg">
      {/* Hero */}
      <div style={{ background: "linear-gradient(135deg,#8A05BE 0%,#6A00A3 100%)" }}
           className="px-5 pb-5 pt-3 text-white">
        <div className="flex items-center justify-between mb-3">
          <button
            type="button" onClick={() => navigate(-1)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20"
          >
            <ArrowLeft size={18} strokeWidth={2} />
          </button>
          <div className="text-center">
            <div className="text-[18px] font-bold tracking-tight">
              {fromCode} <span className="opacity-60 text-sm mx-1">✈</span> {toCode}
            </div>
            <div className="mt-0.5 text-[11px] opacity-80">
              {depStr ? format(depDate, "dd MMM", { locale: ptBR }) : "—"}
              {retStr ? ` · ${format(retDate!, "dd MMM", { locale: ptBR })}` : ""}
              {" · 1 adulto"}
            </div>
          </div>
          <button
            type="button" onClick={() => navigate(-1)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-[13px] font-semibold"
          >✏</button>
        </div>
      </div>

      <div className="overflow-y-auto pb-40">
        {/* Date navigator */}
        <div className="flex overflow-x-auto border-b border-nubank-border bg-white scrollbar-hide">
          {datePrices.map((dp, i) => {
            const key = format(dp.date, "yyyy-MM-dd")
            const active = key === format(selectedDate, "yyyy-MM-dd")
            return (
              <button
                key={i} type="button"
                onClick={() => setSelectedDate(dp.date)}
                className={`relative flex-shrink-0 px-4 py-2.5 text-center ${active ? "bg-purple-50" : "hover:bg-nubank-bg"}`}
              >
                <div className="text-[10px] uppercase text-nubank-text-secondary">
                  {format(dp.date, "EEE", { locale: ptBR })}
                </div>
                <div className={`text-[14px] font-bold ${active ? "text-nubank-primary" : "text-nubank-text"}`}>
                  {format(dp.date, "dd")}
                </div>
                <div className={`text-[10px] font-semibold mt-0.5 ${dp.isCheapest ? "text-green-600" : "text-nubank-text-secondary"}`}>
                  {dp.cheapestMoney ? `${dp.isCheapest ? "★ " : ""}R$${dp.cheapestMoney}` : "—"}
                </div>
                {active && (
                  <div className="absolute bottom-0 left-1/4 right-1/4 h-0.5 rounded-t-sm bg-nubank-primary" />
                )}
              </button>
            )
          })}
        </div>

        {/* Airline summary */}
        <div className="mx-4 mt-3 overflow-hidden rounded-[16px] bg-white shadow-nubank">
          <div className="flex bg-nubank-bg px-4 py-2">
            <div className="flex-[1.4] text-[10px] font-semibold uppercase tracking-wider text-nubank-text-secondary">Cia Aérea</div>
            <div className="flex-1 text-right text-[10px] font-semibold uppercase tracking-wider text-nubank-text-secondary">Pontos</div>
            <div className="flex-1 text-right text-[10px] font-semibold uppercase tracking-wider text-nubank-text-secondary">A partir de</div>
          </div>
          {airlineSummary.map((row) => {
            const colors = AIRLINE_COLORS[row.airline] ?? { bg: "#f5f3ff", text: "#6b5d7e" }
            return (
              <div key={row.airline} className="flex items-center border-t border-nubank-bg px-4 py-2.5">
                <div className="flex flex-[1.4] items-center gap-2">
                  <div className="flex h-6 w-10 items-center justify-center rounded-[6px] text-[9px] font-black"
                       style={{ background: colors.bg, color: colors.text }}>
                    {row.airline.substring(0, 4).toUpperCase()}
                  </div>
                  <span className="text-[13px] font-semibold text-nubank-text">{row.airline}</span>
                </div>
                <div className="flex-1 text-right text-[13px] font-bold text-nubank-primary">
                  {fmtPoints(row.points)}
                </div>
                <div className={`flex-1 text-right text-[13px] font-bold ${row.isCheapest ? "text-green-600" : "text-nubank-text"}`}>
                  {row.isCheapest ? "★ " : ""}{fmtMoney(row.money)}
                </div>
              </div>
            )
          })}
        </div>

        {/* Tabs */}
        <div className="mx-4 mt-3 flex rounded-[14px] bg-white p-1 shadow-nubank">
          {(["ida", "volta"] as const).map((tab) => {
            if (tab === "volta" && !isRoundtrip) return null
            const isActive   = activeTab === tab
            const isEnabled  = tab === "ida" || selectedDepartFlight !== null
            return (
              <button
                key={tab} type="button"
                disabled={!isEnabled}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 rounded-[10px] py-2.5 text-center transition-all disabled:opacity-40 ${
                  isActive ? "bg-nubank-primary text-white shadow-sm" : "text-nubank-text-secondary"
                }`}
              >
                <div className="text-[12px] font-semibold">Voo de {tab === "ida" ? "Ida" : "Volta"}</div>
                <div className={`text-[10px] mt-0.5 ${isActive ? "text-white/80" : "text-nubank-text-secondary"}`}>
                  {tab === "ida"
                    ? (depStr ? format(depDate, "dd/MM/yyyy") : "—")
                    : (retStr ? format(retDate!, "dd/MM/yyyy") : "—")}
                </div>
              </button>
            )
          })}
          {!isRoundtrip && <div className="flex-1" />}
        </div>

        {/* Filter row */}
        <div className="mx-4 mt-2.5 flex items-center justify-between rounded-[12px] bg-white px-3 py-2 shadow-nubank">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-nubank-primary">
            <SlidersHorizontal size={13} strokeWidth={2.5} />
            Filtrar resultado
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-nubank-text-secondary">{currentFlights.length} voos</span>
            <span className="text-[10px] font-bold text-nubank-primary">✓ Dica Gest Miles</span>
          </div>
        </div>

        {/* Sort header */}
        <div className="mx-4 mt-2 flex overflow-hidden rounded-[10px] bg-white shadow-nubank">
          {([
            { id: "time",   label: "Horário",  wide: true  },
            { id: "points", label: "Pontos",   wide: false },
            { id: "money",  label: sortBy === "money" ? "R$ ↓" : "R$", wide: false },
          ] as const).map((col, i) => (
            <button
              key={col.id} type="button"
              onClick={() => setSortBy(col.id)}
              className={`py-2 text-center text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                col.wide ? "flex-[1.6]" : "flex-1"
              } ${i > 0 ? "border-l border-nubank-bg" : ""} ${
                sortBy === col.id ? "bg-purple-50 text-nubank-primary" : "text-nubank-text-secondary"
              }`}
            >
              {col.label}
            </button>
          ))}
        </div>

        {/* Flights */}
        <div className="mx-4 mt-2.5 flex flex-col gap-2.5">
          {currentFlights.map((flight) => {
            const colors = AIRLINE_COLORS[flight.airline] ?? { bg: "#f5f3ff", text: "#6b5d7e" }
            const isSelected =
              (activeTab === "ida" && selectedDepartFlight?.id === flight.id) ||
              (activeTab === "volta" && selectedReturnFlight?.id === flight.id)
            const isBest = flight.id === bestValueId && activeTab === "ida"
            return (
              <div key={flight.id} className={isBest ? "mt-3 relative" : "relative"}>
                {isBest && (
                  <div className="absolute -top-px right-3 z-10 rounded-b-[8px] bg-nubank-primary px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-white">
                    ★ Melhor custo
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => handleFlightSelect(flight)}
                  className={`flex w-full items-center gap-2 rounded-[14px] bg-white px-3.5 py-3 text-left shadow-nubank transition-all border-[1.5px] ${
                    isSelected
                      ? "border-nubank-primary bg-purple-50/50"
                      : "border-transparent hover:border-nubank-border"
                  }`}
                >
                  <div className="flex-[1.6]">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-bold text-nubank-text">{flight.departureTime}</span>
                      <span className="text-nubank-border text-xs">→</span>
                      <span className="text-[14px] font-bold text-nubank-text">{flight.arrivalTime}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <div className="flex h-[18px] w-9 items-center justify-center rounded-[5px] text-[8px] font-black"
                           style={{ background: colors.bg, color: colors.text }}>
                        {flight.airline.substring(0, 3).toUpperCase()}
                      </div>
                      <span className="text-[10px] text-nubank-text-secondary">{fmtDur(flight.durationMinutes)}</span>
                      <span className={`rounded-[5px] px-1.5 py-0.5 text-[9px] font-semibold ${
                        flight.stops === 0 ? "bg-green-50 text-green-700" : "bg-orange-50 text-orange-700"
                      }`}>
                        {flight.stops === 0 ? "Direto" : `${flight.stops} escala`}
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 text-right">
                    <div className="text-[13px] font-bold text-nubank-text">{fmtPoints(flight.points)}</div>
                    <div className="text-[9px] text-nubank-text-secondary">pontos</div>
                    <div className="mt-0.5 text-[9px] font-semibold text-nubank-primary">+ info</div>
                  </div>
                  <div className="flex-1 text-right">
                    <div className="text-[13px] font-bold text-nubank-text">{fmtMoney(flight.money)}</div>
                  </div>
                  {isSelected && (
                    <div className="ml-2 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-nubank-primary">
                      <Check size={11} strokeWidth={3} className="text-white" />
                    </div>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Sticky bottom bar */}
      {selectedDepartFlight ? (
        <div className="fixed inset-x-0 bottom-0 z-40 flex flex-col border-t border-nubank-border bg-white/97 backdrop-blur-sm shadow-lg">
          <div className="mx-auto w-full max-w-md px-4 pt-2.5 pb-2">
            <div className="mb-2 flex items-center justify-between rounded-[10px] bg-purple-50 px-3 py-2">
              <div>
                <p className="text-[11px] font-bold text-nubank-primary">
                  IDA · {selectedDepartFlight.originCode} {selectedDepartFlight.departureTime} → {selectedDepartFlight.destinationCode} {selectedDepartFlight.arrivalTime}
                </p>
                <p className="text-[10px] text-nubank-text-secondary">
                  {selectedDepartFlight.airline} · {fmtDur(selectedDepartFlight.durationMinutes)} · {selectedDepartFlight.stops === 0 ? "Direto" : `${selectedDepartFlight.stops} escala`}
                </p>
              </div>
              <div className="text-right">
                <div className="text-[13px] font-bold text-nubank-text">{fmtMoney(selectedDepartFlight.money)}</div>
                <div className="text-[10px] text-nubank-text-secondary">{fmtPoints(selectedDepartFlight.points)} pts</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (isRoundtrip && !selectedReturnFlight) setActiveTab("volta")
                else setIsPaymentDrawerOpen(true)
              }}
              className="w-full rounded-[14px] py-3.5 text-[14px] font-semibold text-white shadow-md"
              style={{ background: "linear-gradient(135deg,#8A05BE,#9E2FD4)" }}
            >
              {isRoundtrip && !selectedReturnFlight
                ? "Selecionar voo de volta →"
                : "Ver opções de pagamento →"}
            </button>
          </div>
          <BottomNav showClientSelector={isGestor} clients={[]} />
        </div>
      ) : (
        <div className="fixed inset-x-0 bottom-0 z-40">
          <BottomNav showClientSelector={isGestor} clients={[]} />
        </div>
      )}

      {/* Payment Options Drawer */}
      <Drawer open={isPaymentDrawerOpen} onOpenChange={setIsPaymentDrawerOpen}>
        <DrawerContent className="mx-auto max-h-[85vh] w-full max-w-md rounded-t-[24px] border-0 bg-white">
          <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-nubank-border" />
          <DrawerHeader className="px-5 pt-4 text-left">
            <DrawerTitle className="text-[16px] font-bold text-nubank-text">
              Como quer usar seus pontos?
            </DrawerTitle>
            <DrawerDescription className="mt-1 text-[12px] text-nubank-text-secondary">
              Selecione a combinação ideal para você
            </DrawerDescription>
          </DrawerHeader>
          <div className="space-y-3 px-5 pb-6">
            {paymentOptions.map((opt, i) => {
              const isSelected = selectedPayment?.id === opt.id
              return (
                <button
                  key={opt.id} type="button"
                  onClick={() => setSelectedPayment(opt)}
                  className={`flex w-full items-center gap-3 rounded-[14px] border-[1.5px] p-3.5 text-left transition-all ${
                    isSelected ? "border-nubank-primary bg-purple-50/60" : "border-nubank-border"
                  }`}
                >
                  <div className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                    isSelected ? "border-nubank-primary bg-nubank-primary" : "border-nubank-border"
                  }`}>
                    {isSelected && <div className="h-2 w-2 rounded-full bg-white" />}
                  </div>
                  <div className="flex-1">
                    <div className="text-[14px] font-bold text-nubank-text">
                      {fmtPoints(opt.points)}{" "}
                      <span className="text-[11px] font-normal text-nubank-text-secondary">pts</span>
                      {opt.money > 0 && (
                        <span className="text-nubank-text-secondary"> + {fmtMoney(opt.money)}</span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] text-nubank-text-secondary">{opt.label}</div>
                  </div>
                  {i === 0 && (
                    <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-bold text-green-700">
                      Mais pts
                    </span>
                  )}
                  {i > 0 && opt.money > 0 && (
                    <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-nubank-primary">
                      Misto
                    </span>
                  )}
                </button>
              )
            })}

            {selectedDepartFlight && (
              <div className="rounded-[12px] bg-nubank-bg px-3 py-2.5">
                <p className="text-[11px] font-semibold text-nubank-text-secondary">Voo selecionado</p>
                <p className="mt-1 text-[13px] font-bold text-nubank-text">
                  IDA · {selectedDepartFlight.originCode} {selectedDepartFlight.departureTime} → {selectedDepartFlight.destinationCode} {selectedDepartFlight.arrivalTime}
                </p>
                <p className="text-[11px] text-nubank-text-secondary">
                  {selectedDepartFlight.airline} · {selectedDepartFlight.flightNumber} · {fmtDur(selectedDepartFlight.durationMinutes)}
                </p>
              </div>
            )}

            <button
              type="button"
              disabled={!selectedPayment}
              onClick={handleConfirmPayment}
              className="w-full rounded-[14px] py-4 text-[14px] font-semibold text-white shadow-md disabled:opacity-40"
              style={{ background: "linear-gradient(135deg,#8A05BE,#9E2FD4)" }}
            >
              Confirmar seleção →
            </button>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  )
}
```

- [ ] **Step 4.2 — Verificar compilação**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 4.3 — Commit**

```bash
git add src/pages/FlightResultsScreen.tsx
git commit -m "feat: criar FlightResultsScreen com lista de voos, navegador de datas e drawer de pagamento"
```

---

## Task 5: Criar EmissionDetailsScreen

**Files:**
- Create: `src/pages/EmissionDetailsScreen.tsx`

- [ ] **Step 5.1 — Criar `src/pages/EmissionDetailsScreen.tsx`**

```tsx
import { useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ArrowLeft } from "lucide-react"
import BottomNav from "@/components/BottomNav"
import { useAuth } from "@/contexts/AuthContext"
import type { EmissionFlightState, ScheduledFlight } from "@/lib/flight-types"

const fmtMoney = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const fmtDur   = (min: number) => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m`

const AIRLINE_COLORS: Record<string, { bg: string; text: string }> = {
  GOL:   { bg: "#fff4ed", text: "#e87722" },
  LATAM: { bg: "#fff0f3", text: "#d42054" },
  Azul:  { bg: "#eef4ff", text: "#0050b3" },
}

export default function EmissionDetailsScreen() {
  const navigate    = useNavigate()
  const { role }    = useAuth()
  const isGestor    = role === "gestor" || role === "admin"
  const location    = useLocation()
  const state       = location.state as EmissionFlightState | null
  const [activeTab, setActiveTab] = useState<"ida" | "volta" | "total">("total")

  if (!state) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-nubank-bg">
        <div className="text-center px-4">
          <p className="text-nubank-text-secondary">Dados não encontrados.</p>
          <button
            type="button" onClick={() => navigate("/search-flights")}
            className="mt-4 rounded-[12px] bg-nubank-primary px-6 py-3 text-sm font-semibold text-white"
          >
            Nova busca
          </button>
        </div>
      </div>
    )
  }

  const { departureFlight, returnFlight, departureDate, returnDate: retDateStr, paymentOption } = state
  const depDate = parseISO(departureDate)
  const retDate = retDateStr ? parseISO(retDateStr) : null

  const tarifa = departureFlight.money + (returnFlight?.money ?? 0)
  const taxa   = parseFloat((tarifa * 0.2017).toFixed(2))
  const total  = parseFloat((tarifa + taxa).toFixed(2))

  const FlightCard = ({
    flight, label, date, accentColor,
  }: {
    flight: ScheduledFlight
    label: string
    date: Date
    accentColor: string
  }) => {
    const colors = AIRLINE_COLORS[flight.airline] ?? { bg: "#f5f3ff", text: "#6b5d7e" }
    return (
      <div>
        <div className="mb-2.5 flex items-center gap-2">
          <div
            className="rounded-[8px] px-2.5 py-1 text-[11px] font-bold"
            style={{ background: `${accentColor}22`, color: accentColor }}
          >
            {label}
          </div>
          <span className="text-[12px] font-semibold capitalize text-nubank-text-secondary">
            {format(date, "EEE, dd MMM yyyy", { locale: ptBR })}
          </span>
        </div>
        <div className="rounded-[16px] p-4" style={{ background: `${accentColor}0d` }}>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[13px] font-bold text-nubank-text">
              {flight.airline}: Voo {flight.flightNumber}
            </p>
            <div
              className="flex h-6 w-12 items-center justify-center rounded-[6px] text-[9px] font-black"
              style={{ background: colors.bg, color: colors.text }}
            >
              {flight.airline.substring(0, 4).toUpperCase()}
            </div>
          </div>
          <div className="mb-3 flex items-center gap-2">
            <span className="text-[13px] font-bold text-nubank-text">{flight.originCode}</span>
            <div className="flex flex-1 items-center gap-1">
              <div className="h-px flex-1" style={{ background: `linear-gradient(to right,${accentColor},${accentColor}40)` }} />
              <span style={{ color: accentColor }}>✈</span>
              <div className="h-px flex-1" style={{ background: `linear-gradient(to right,${accentColor}40,${accentColor})` }} />
            </div>
            <span className="text-[13px] font-bold text-nubank-text">{flight.destinationCode}</span>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <div className="text-[17px] font-bold text-nubank-text">{flight.departureTime}</div>
              <div className="text-[11px] text-nubank-text-secondary">{state.fromName}</div>
            </div>
            <div className="text-center">
              <div className="text-[12px] font-bold" style={{ color: accentColor }}>{fmtDur(flight.durationMinutes)}</div>
              <div className="text-[10px] text-nubank-text-secondary">
                {flight.stops === 0 ? "sem paradas" : `${flight.stops} escala`}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[17px] font-bold text-nubank-text">{flight.arrivalTime}</div>
              <div className="text-[11px] text-nubank-text-secondary">{state.toName}</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const tabs = [
    { id: "ida"   as const, label: "Ida" },
    ...(returnFlight ? [{ id: "volta" as const, label: "Volta" }] : []),
    { id: "total" as const, label: "Total" },
  ]

  return (
    <div className="min-h-screen bg-nubank-bg">
      <header className="sticky top-0 z-40 border-b border-nubank-border bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
          <button type="button" onClick={() => navigate(-1)}
            className="-ml-1 flex h-9 w-9 items-center justify-center rounded-full text-nubank-text-secondary hover:bg-nubank-bg">
            <ArrowLeft size={20} strokeWidth={1.5} />
          </button>
          <div className="text-center">
            <h1 className="text-[15px] font-semibold text-nubank-text">Detalhes da emissão</h1>
            <p className="text-[11px] text-nubank-text-secondary">{state.from} → {state.to}</p>
          </div>
          <div className="w-9" />
        </div>
      </header>

      <div className="flex border-b-2 border-nubank-border bg-white px-5">
        {tabs.map((tab) => (
          <button
            key={tab.id} type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 border-b-2 pb-3 pt-3 text-[13px] font-semibold transition-colors ${
              activeTab === tab.id
                ? "border-nubank-primary text-nubank-primary"
                : "border-transparent text-nubank-text-secondary"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mx-auto max-w-md space-y-4 px-4 pb-36 pt-5">
        {(activeTab === "ida" || activeTab === "total") && (
          <FlightCard flight={departureFlight} label="IDA" date={depDate} accentColor="#8A05BE" />
        )}
        {returnFlight && (activeTab === "volta" || activeTab === "total") && (
          <FlightCard flight={returnFlight} label="VOLTA" date={retDate!} accentColor="#16a34a" />
        )}
        {activeTab === "total" && (
          <div>
            <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-nubank-text-secondary">
              Resumo de valores
            </p>
            <div className="rounded-[16px] bg-white px-4 shadow-nubank">
              {[
                { label: "Tarifa por adulto",      value: fmtMoney(tarifa) },
                { label: `Adulto(s)`,              value: `× ${state.passengers}` },
                { label: "Forma de pagamento",     value: paymentOption.money > 0
                  ? `${paymentOption.points.toLocaleString("pt-BR")} pts + ${fmtMoney(paymentOption.money)}`
                  : `${paymentOption.points.toLocaleString("pt-BR")} pts`,
                  accent: true },
                { label: "Taxa de embarque",       value: fmtMoney(taxa) },
              ].map((row) => (
                <div key={row.label} className="flex justify-between border-b border-nubank-bg py-3">
                  <span className="text-[13px] text-nubank-text-secondary">{row.label}</span>
                  <span className={`text-[13px] font-semibold ${row.accent ? "text-nubank-primary" : "text-nubank-text"}`}>
                    {row.value}
                  </span>
                </div>
              ))}
              <div className="flex justify-between py-3">
                <span className="text-[15px] font-bold text-nubank-text">Total</span>
                <span className="text-[17px] font-extrabold text-nubank-primary">{fmtMoney(total)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 flex flex-col border-t border-nubank-border bg-white/95 backdrop-blur-sm">
        <div className="mx-auto w-full max-w-md px-4 pt-3 pb-2">
          <button
            type="button"
            onClick={() => navigate("/purchase-options", { state })}
            className="w-full rounded-[16px] py-4 text-[15px] font-semibold text-white shadow-md"
            style={{ background: "linear-gradient(135deg,#8A05BE,#9E2FD4)" }}
          >
            Iniciar compra →
          </button>
        </div>
        <BottomNav showClientSelector={isGestor} clients={[]} />
      </div>
    </div>
  )
}
```

- [ ] **Step 5.2 — Verificar compilação**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 5.3 — Commit**

```bash
git add src/pages/EmissionDetailsScreen.tsx
git commit -m "feat: criar EmissionDetailsScreen com tabs IDA/VOLTA/TOTAL e breakdown de preço"
```

---

## Task 6: Criar PurchaseOptionsScreen

**Files:**
- Create: `src/pages/PurchaseOptionsScreen.tsx`

- [ ] **Step 6.1 — Criar `src/pages/PurchaseOptionsScreen.tsx`**

```tsx
import { useLocation, useNavigate } from "react-router-dom"
import { ArrowLeft, ExternalLink } from "lucide-react"
import BottomNav from "@/components/BottomNav"
import { useAuth } from "@/contexts/AuthContext"
import type { EmissionFlightState } from "@/lib/flight-types"
import { GESTMILES_EMISSION_ENABLED } from "@/config/features"

const AIRLINE_URLS: Record<string, string> = {
  GOL:      "https://www.voegol.com.br",
  LATAM:    "https://www.latamairlines.com/br/pt",
  Azul:     "https://www.voeazul.com.br",
  TAP:      "https://www.flytap.com/pt-br",
  American: "https://www.aa.com/pt-BR",
}

const AIRLINE_COLORS: Record<string, { bg: string; text: string }> = {
  GOL:   { bg: "#fff4ed", text: "#e87722" },
  LATAM: { bg: "#fff0f3", text: "#d42054" },
  Azul:  { bg: "#eef4ff", text: "#0050b3" },
}

const fmtMoney = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

export default function PurchaseOptionsScreen() {
  const navigate = useNavigate()
  const { role } = useAuth()
  const isGestor = role === "gestor" || role === "admin"
  const location = useLocation()
  const state    = location.state as EmissionFlightState | null

  if (!state) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-nubank-bg">
        <div className="text-center px-4">
          <p className="text-nubank-text-secondary">Dados não encontrados.</p>
          <button
            type="button" onClick={() => navigate("/search-flights")}
            className="mt-4 rounded-[12px] bg-nubank-primary px-6 py-3 text-sm font-semibold text-white"
          >
            Nova busca
          </button>
        </div>
      </div>
    )
  }

  const { departureFlight, returnFlight } = state
  const tarifa   = departureFlight.money + (returnFlight?.money ?? 0)
  const taxa     = parseFloat((tarifa * 0.2017).toFixed(2))
  const total    = parseFloat((tarifa + taxa).toFixed(2))
  const airline  = departureFlight.airline
  const airlineUrl = AIRLINE_URLS[airline] ?? "https://google.com/flights"
  const colors   = AIRLINE_COLORS[airline] ?? { bg: "#f5f3ff", text: "#6b5d7e" }

  return (
    <div className="min-h-screen bg-nubank-bg">
      <header className="sticky top-0 z-40 border-b border-nubank-border bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
          <button type="button" onClick={() => navigate(-1)}
            className="-ml-1 flex h-9 w-9 items-center justify-center rounded-full text-nubank-text-secondary hover:bg-nubank-bg">
            <ArrowLeft size={20} strokeWidth={1.5} />
          </button>
          <h1 className="text-[15px] font-semibold text-nubank-text">Opções de compra</h1>
          <div className="flex h-9 w-9 items-center justify-center text-[15px] font-bold text-nubank-text-secondary">?</div>
        </div>
      </header>

      {/* Hero */}
      <div
        className="px-5 py-5 text-center text-white"
        style={{ background: "linear-gradient(135deg,#8A05BE 0%,#6A00A3 100%)" }}
      >
        <h2 className="text-[17px] font-bold">Como deseja adquirir?</h2>
        <p className="mt-1 text-[12px] opacity-80">Escolha a melhor forma de comprar sua passagem</p>
        <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-[12px]">
          ✈ {state.from} → {state.to}
        </div>
      </div>

      <main className="mx-auto max-w-md space-y-3 px-4 pb-36 pt-4">

        {/* Site da Cia Aérea */}
        <div className="rounded-[18px] bg-white p-5 shadow-nubank border border-nubank-border">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[13px] text-nubank-text-secondary">Compre pelo site da Cia Aérea</span>
            <div
              className="flex h-7 w-12 items-center justify-center rounded-[8px] text-[10px] font-black"
              style={{ background: colors.bg, color: colors.text }}
            >
              {airline.substring(0, 4).toUpperCase()}
            </div>
          </div>

          <div className="mb-1 text-[11px] text-nubank-text-secondary">Total estimado</div>
          <div className="mb-3 text-[28px] font-extrabold tracking-tight text-nubank-text"
               style={{ letterSpacing: "-1px" }}>
            {fmtMoney(total)}
          </div>

          <div className="mb-4 space-y-2 rounded-[12px] bg-nubank-bg px-3 py-3">
            <div className="flex justify-between text-[12px]">
              <span className="text-nubank-text-secondary">Tarifa adulto</span>
              <span className="font-semibold text-nubank-text">{fmtMoney(tarifa)}</span>
            </div>
            <div className="flex justify-between text-[12px]">
              <span className="text-nubank-text-secondary">Taxa de embarque</span>
              <span className="font-semibold text-nubank-text">{fmtMoney(taxa)}</span>
            </div>
            <div className="flex justify-between border-t border-nubank-border pt-2 text-[13px]">
              <span className="font-bold text-nubank-text">Total</span>
              <span className="font-bold text-nubank-text">{fmtMoney(total)}</span>
            </div>
          </div>

          <a
            href={airlineUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-purple-50 py-3.5 text-[13px] font-semibold text-nubank-primary transition-colors hover:bg-purple-100"
          >
            <ExternalLink size={15} strokeWidth={2.5} />
            Ir para o site da {airline}
          </a>
        </div>

        {/* Gest Miles — controlado por feature flag */}
        {GESTMILES_EMISSION_ENABLED ? (
          <div className="rounded-[18px] border-[1.5px] border-nubank-primary bg-white p-5 shadow-nubank">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[13px] text-nubank-text-secondary">Emitir com Gest Miles</span>
              <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-[10px] font-bold text-nubank-primary">
                ✦ Recomendado
              </span>
            </div>
            {/* Implementar card completo quando ativar a feature */}
            <button
              type="button"
              className="w-full rounded-[14px] py-3.5 text-[13px] font-semibold text-white"
              style={{ background: "linear-gradient(135deg,#8A05BE,#9E2FD4)" }}
            >
              Emitir agora →
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-4 rounded-[18px] border border-dashed border-nubank-border bg-white/60 p-4 opacity-60">
            <div
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[12px] opacity-40"
              style={{ background: "linear-gradient(135deg,#8A05BE,#9E2FD4)" }}
            >
              <span className="text-lg text-white">✦</span>
            </div>
            <div className="flex-1">
              <p className="text-[13px] font-semibold text-nubank-text-secondary">Emitir com Gest Miles</p>
              <p className="text-[11px] text-nubank-border">Suporte completo + gestão de pontos</p>
            </div>
            <span className="rounded-full bg-purple-50 px-2.5 py-1 text-[10px] font-bold text-nubank-border">
              Em breve
            </span>
          </div>
        )}

      </main>

      <div className="fixed inset-x-0 bottom-0 z-40">
        <BottomNav showClientSelector={isGestor} clients={[]} />
      </div>
    </div>
  )
}
```

- [ ] **Step 6.2 — Verificar compilação**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 6.3 — Commit**

```bash
git add src/pages/PurchaseOptionsScreen.tsx
git commit -m "feat: criar PurchaseOptionsScreen com site da cia aérea e placeholder Gest Miles (feature flag)"
```

---

## Task 7: Registrar rotas no App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 7.1 — Adicionar imports das 3 novas páginas**

No topo de `src/App.tsx`, após a linha de import de `SearchFlightsScreen`:

```tsx
import FlightResultsScreen from "./pages/FlightResultsScreen"
import EmissionDetailsScreen from "./pages/EmissionDetailsScreen"
import PurchaseOptionsScreen from "./pages/PurchaseOptionsScreen"
```

- [ ] **Step 7.2 — Adicionar 3 rotas dentro de `<Routes>` após a rota `/search-flights`**

Após o bloco:
```tsx
<Route
  path="/search-flights"
  element={<ClienteOnly><SearchFlightsScreen /></ClienteOnly>}
/>
```

Adicionar:
```tsx
<Route
  path="/flight-results"
  element={<ClienteOnly><FlightResultsScreen /></ClienteOnly>}
/>
<Route
  path="/emission-details"
  element={<ClienteOnly><EmissionDetailsScreen /></ClienteOnly>}
/>
<Route
  path="/purchase-options"
  element={<ClienteOnly><PurchaseOptionsScreen /></ClienteOnly>}
/>
```

- [ ] **Step 7.3 — Verificar compilação final**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 7.4 — Rodar o dev server e testar o fluxo manualmente**

```bash
npm run dev
```

Fluxo de teste:
1. Ir para `/search-flights` — verificar novo design da tela
2. Selecionar origem (ex: São Paulo), destino (ex: Curitiba), datas e clicar "Pesquisar passagens"
3. Verificar que `/flight-results` abre com hero roxo, navegador de datas e lista de voos
4. Clicar em um voo de ida → tab de volta aparece (se roundtrip) ou drawer de pagamento abre
5. Selecionar opção de pagamento → navega para `/emission-details`
6. Verificar tabs IDA / VOLTA / TOTAL e breakdown de preço
7. Clicar "Iniciar compra →" → navega para `/purchase-options`
8. Verificar card da cia aérea com total e botão de link externo
9. Verificar que card "Em breve" aparece (GESTMILES_EMISSION_ENABLED = false)
10. Voltar ao dashboard, clicar em um card de destino → verificar que `/search-flights` abre com destino pré-preenchido

- [ ] **Step 7.5 — Commit final**

```bash
git add src/App.tsx
git commit -m "feat: registrar rotas flight-results, emission-details e purchase-options"
```
