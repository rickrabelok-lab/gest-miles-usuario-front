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
