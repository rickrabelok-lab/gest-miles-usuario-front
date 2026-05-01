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
