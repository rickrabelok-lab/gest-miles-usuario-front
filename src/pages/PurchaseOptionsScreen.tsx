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
