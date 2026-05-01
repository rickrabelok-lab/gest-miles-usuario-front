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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
