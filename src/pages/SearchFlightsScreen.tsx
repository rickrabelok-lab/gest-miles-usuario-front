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
import { toast } from "sonner"
import { useAuth } from "@/contexts/AuthContext"
import { useSearchFlights } from "@/contexts/SearchFlightsContext"
import BottomNav from "@/components/BottomNav"
import DestinationCarousel from "@/components/DestinationCarousel"
import { cn } from "@/lib/utils"
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

  /** Origem por defeito (o contexto começa sem origem → o botão «Pesquisar» ficava sempre desativado). */
  useEffect(() => {
    if (origin) return
    const gru = findAirportByCode("GRU")
    if (gru) setOrigin(gru)
  }, [origin, setOrigin])

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
    if (!origin || !destination) {
      toast.error("Selecione origem e destino para pesquisar.")
      return
    }
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
      <header className="mx-auto max-w-md px-5 pt-4">
        <h1 className="font-display text-2xl font-bold tracking-tight text-nubank-text">
          Passagens
        </h1>
        <p className="mt-0.5 text-[13px] text-nubank-text-secondary">
          Busque com pontos, dinheiro ou os dois
        </p>
      </header>

      <main className="mx-auto max-w-md px-5 pb-44 pt-4">
        <div className="space-y-3.5">

          {/* Trip type */}
          <div className="flex rounded-[16px] bg-[#EDECEF] p-1">
            {(["roundtrip", "oneway"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => { setTripType(type); if (type === "oneway") setReturnDate(null) }}
                className={`flex-1 rounded-[13px] py-2.5 text-[13.5px] transition-all ${
                  tripType === type
                    ? "bg-white font-semibold text-nubank-text shadow-[0_1px_4px_rgba(24,6,38,0.08)]"
                    : "font-medium text-nubank-text-secondary"
                }`}
              >
                {type === "roundtrip" ? "Ida e volta" : "Somente ida"}
              </button>
            ))}
          </div>

          {/* Route */}
          <div className="relative rounded-[20px] bg-white shadow-nubank-card">
            <button
              type="button"
              onClick={() => setAirportPickerTarget("origin")}
              className="flex w-full items-center gap-3 py-4 pl-4 pr-[72px]"
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[13px] bg-nubank-tint text-nubank-primary">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 21h20"/><path d="M3.5 13.5 2 9l2-.6 3.2 2.8 5.8-1.9L8.5 2.6l2.4-.7 6.8 6.2 3.9-1.2c1-.3 2.1.3 2.4 1.3.3 1-.3 2-1.3 2.4L4.6 15z"/>
                </svg>
              </div>
              <div className="min-w-0 flex-1 text-left">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">Origem</p>
                <p className={`mt-0.5 truncate text-[15.5px] font-semibold ${origin ? "text-nubank-text" : "text-[#A9A8AE]"}`}>
                  {origin ? formatAirportLabel(origin) : "De onde você sai?"}
                </p>
              </div>
            </button>

            <div className="ml-[68px] mr-4 h-px bg-[#F1F0F3]" />

            <button
              type="button"
              onClick={() => setAirportPickerTarget("destination")}
              className="flex w-full items-center gap-3 py-4 pl-4 pr-[72px]"
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[13px] bg-success-soft text-success-strong">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 21s7-5.4 7-11a7 7 0 0 0-14 0c0 5.6 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>
                </svg>
              </div>
              <div className="min-w-0 flex-1 text-left">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">Destino</p>
                <p className={`mt-0.5 truncate text-[15.5px] font-semibold ${destination ? "text-nubank-text" : "text-[#A9A8AE]"}`}>
                  {destination ? formatAirportLabel(destination) : "Para onde?"}
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={swapOriginDestination}
              aria-label="Trocar origem e destino"
              className="absolute right-4 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-nubank-border bg-white text-nubank-primary shadow-[0_2px_8px_rgba(24,6,38,0.08)] transition-colors hover:bg-nubank-tint"
            >
              <ArrowLeftRight size={17} strokeWidth={2} />
            </button>
          </div>

          {/* Dates + Quem vai */}
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => openDatePicker("departure")}
              className="min-w-0 flex-1 rounded-[18px] bg-white px-3.5 py-3 text-left shadow-nubank-card"
            >
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">Ida</p>
              <p className={`mt-1 truncate text-[14px] font-semibold ${departureDate ? "text-nubank-text" : "text-[#A9A8AE]"}`}>
                {departureDate ? fmt(departureDate) : "Data"}
              </p>
            </button>

            {tripType === "roundtrip" && (
              <button
                type="button"
                onClick={() => openDatePicker("return")}
                className="min-w-0 flex-1 rounded-[18px] bg-white px-3.5 py-3 text-left shadow-nubank-card"
              >
                <div className="flex items-center justify-between">
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">Volta</p>
                  {returnDate && (
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label="Limpar data de volta"
                      onClick={(e) => { e.stopPropagation(); setReturnDate(null) }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); setReturnDate(null) }
                      }}
                      className="-mr-1 text-nubank-text-secondary hover:text-nubank-text"
                    >
                      <X size={13} />
                    </span>
                  )}
                </div>
                <p className={`mt-1 truncate text-[14px] font-semibold ${returnDate ? "text-nubank-text" : "text-[#A9A8AE]"}`}>
                  {returnDate ? fmt(returnDate) : "Data"}
                </p>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsPassengersDrawerOpen(true)}
              title={passengerSummary}
              className="min-w-0 flex-1 rounded-[18px] bg-white px-3.5 py-3 text-left shadow-nubank-card"
            >
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">Quem vai</p>
              <p className="mt-1 truncate text-[14px] font-semibold text-nubank-text">
                {passengers.adult + passengers.child + passengers.baby} ·{" "}
                {cabinClass === "executiva" ? "Exec." : "Econ."}
              </p>
            </button>
          </div>

          {/* Payment mode */}
          <div>
            <p className="section-label px-0.5">Pagar com</p>
            <div className="flex gap-2">
              {([
                { id: "both",   label: "Pontos + R$" },
                { id: "points", label: "Pontos"   },
                { id: "money",  label: "Dinheiro"  },
              ] as const).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPaymentMode(m.id)}
                  className={`flex-1 rounded-[14px] py-3 text-[13px] font-semibold transition-all ${
                    paymentMode === m.id
                      ? "bg-nubank-text text-white"
                      : "border border-nubank-border bg-white text-[#54535A] hover:bg-nubank-bg"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Airlines */}
          <div>
            <div className="flex items-baseline justify-between px-0.5">
              <p className="section-label mb-2.5">Companhias</p>
              <span className="text-[12.5px] font-semibold text-primary">
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
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[12.5px] font-semibold transition-all ${
                      active
                        ? "border-[#E5CCF2] bg-nubank-tint text-nubank-dark"
                        : "border-nubank-border bg-white text-[#54535A] hover:bg-nubank-bg"
                    }`}
                  >
                    <span
                      className="inline-block h-[7px] w-[7px] rounded-full"
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
            <DestinationCarousel
              origins={origin ? [origin.code] : []}
              onDestinationClick={handleDestinationCardClick}
            />
          </div>

        </div>
      </main>

      {/* Fixed CTA */}
      <div className="pointer-events-auto fixed inset-x-0 bottom-0 z-[100] flex flex-col border-t border-[#F1F0F3] bg-white/95 backdrop-blur-sm">
        <div className="mx-auto w-full max-w-md px-5 pb-2 pt-3">
          <Button
            type="button"
            aria-disabled={!canSearch}
            onClick={handleSearch}
            className={cn(
              "h-[54px] w-full gap-2 rounded-[18px] text-[15.5px] font-bold text-white",
              canSearch
                ? "shadow-[0_6px_18px_-4px_rgba(138,5,190,0.5)]"
                : "opacity-40 shadow-none",
            )}
            style={{
              background: canSearch
                ? "linear-gradient(135deg,#8A05BE,#9E2FD4 50%,#B56CFF)"
                : "#d1c4e0",
            }}
          >
            <Search size={19} strokeWidth={2} />
            Buscar voos
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
