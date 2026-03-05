import {
  ArrowLeft,
  ArrowLeftRight,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Minus,
  Plus,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { useSearchFlights } from "@/contexts/SearchFlightsContext";
import {
  AIRPORTS,
  findAirportByCode,
  formatAirportLabel,
  type AirportOption,
} from "@/lib/airports";
import AirlineLogo from "@/components/AirlineLogo";

type MockFlight = {
  id: string;
  originCode: string;
  destinationCode: string;
  origin: string;
  destination: string;
  airline: string;
  points: number;
  money: number;
};

const MOCK_FLIGHTS: MockFlight[] = [
  { id: "f1", originCode: "GRU", destinationCode: "CWB", origin: "Sao Paulo - GRU", destination: "Curitiba - CWB", airline: "G3", points: 4000, money: 286.9 },
  { id: "f2", originCode: "CNF", destinationCode: "SDU", origin: "Belo Horizonte - CNF", destination: "Rio de Janeiro - SDU", airline: "LA", points: 4863, money: 312.5 },
  { id: "f3", originCode: "CGH", destinationCode: "POA", origin: "Sao Paulo - CGH", destination: "Porto Alegre - POA", airline: "AD", points: 4878, money: 355.2 },
  { id: "f4", originCode: "BSB", destinationCode: "REC", origin: "Brasilia - BSB", destination: "Recife - REC", airline: "LA", points: 8200, money: 499.0 },
  { id: "f5", originCode: "GIG", destinationCode: "LIS", origin: "Rio de Janeiro - GIG", destination: "Lisboa - LIS", airline: "TP", points: 38500, money: 2890.0 },
  { id: "f6", originCode: "GRU", destinationCode: "JFK", origin: "Sao Paulo - GRU", destination: "Nova York - JFK", airline: "AA", points: 45200, money: 3210.0 },
  { id: "f7", originCode: "GRU", destinationCode: "MAD", origin: "Sao Paulo - GRU", destination: "Madri - MAD", airline: "IB", points: 41800, money: 2749.0 },
  { id: "f8", originCode: "POA", destinationCode: "SCL", origin: "Porto Alegre - POA", destination: "Santiago - SCL", airline: "LA", points: 15800, money: 980.0 },
];

const MONTH_OPTIONS = [
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
  "Janeiro",
  "Fevereiro",
];

const BRAZIL_NATIONAL_HOLIDAYS = [
  "Confraternização Universal",
  "Tiradentes",
  "Dia do Trabalhador",
  "Independência do Brasil",
  "Nossa Senhora Aparecida",
  "Finados",
  "Proclamação da República",
  "Dia da Consciência Negra",
  "Natal",
];

const SearchFlightsScreen = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [airportPickerTarget, setAirportPickerTarget] = useState<
    "origin" | "destination" | null
  >(null);
  const [airportQuery, setAirportQuery] = useState("");
  const [isPassengersDrawerOpen, setIsPassengersDrawerOpen] = useState(false);
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(false);
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [selectedHolidays, setSelectedHolidays] = useState<string[]>([]);
  const monthsScrollRef = useRef<HTMLDivElement | null>(null);
  const holidaysScrollRef = useRef<HTMLDivElement | null>(null);
  const dragMetaRef = useRef<{
    row: "months" | "holidays" | null;
    isDown: boolean;
    startX: number;
    startScrollLeft: number;
  }>({
    row: null,
    isDown: false,
    startX: 0,
    startScrollLeft: 0,
  });
  const ignoreTapRef = useRef(false);
  const {
    origin,
    destination,
    mode,
    passengers,
    cabinClass,
    setOrigin,
    setDestination,
    swapOriginDestination,
    setMode,
    setPassengerCount,
    setCabinClass,
  } = useSearchFlights();

  useEffect(() => {
    const destinationCode = searchParams.get("destination");
    const fromCardDestination = findAirportByCode(destinationCode);
    if (fromCardDestination) {
      setDestination(fromCardDestination);
    }
  }, [searchParams, setDestination]);

  const passengerSummary = useMemo(() => {
    const parts: string[] = [];
    if (passengers.adult > 0) parts.push(`${passengers.adult} Adulto`);
    if (passengers.child > 0) parts.push(`${passengers.child} Crianca`);
    if (passengers.baby > 0) parts.push(`${passengers.baby} Bebe`);
    return parts.length > 0 ? parts.join(", ") : "Selecione passageiros";
  }, [passengers]);

  const filteredAirports = useMemo(() => {
    const query = airportQuery.trim().toLowerCase();
    if (!query) return AIRPORTS.slice(0, 20);
    return AIRPORTS.filter((airport) => {
      const haystack = `${airport.city} ${airport.code} ${airport.name} ${airport.country}`.toLowerCase();
      return haystack.includes(query);
    }).slice(0, 30);
  }, [airportQuery]);

  const selectAirport = (airport: AirportOption) => {
    if (airportPickerTarget === "origin") {
      setOrigin(airport);
    } else if (airportPickerTarget === "destination") {
      setDestination(airport);
    }
    setAirportPickerTarget(null);
    setAirportQuery("");
  };

  const canAdvance = !!origin && !!destination;
  const triggerTapFeedback = () => {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(8);
    }
  };

  const destinationCode = destination?.code ?? null;
  const filteredMockFlights = useMemo(() => {
    if (!destinationCode) return MOCK_FLIGHTS.slice(0, 6);
    const target = destinationCode.toUpperCase();
    const matches = MOCK_FLIGHTS.filter((flight) => flight.destinationCode === target);
    return matches.length > 0 ? matches : MOCK_FLIGHTS.slice(0, 6);
  }, [destinationCode]);

  const formatMoney = (value: number) =>
    value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const handleOpenCalendarFromMockFlight = (flight: MockFlight) => {
    const nextOrigin = findAirportByCode(flight.originCode);
    const nextDestination = findAirportByCode(flight.destinationCode);

    if (nextOrigin) setOrigin(nextOrigin);
    if (nextDestination) setDestination(nextDestination);

    navigate(`/price-calendar?airline=${encodeURIComponent(flight.airline)}`);
  };

  const toggleArrayItem = (
    value: string,
    items: string[],
    setter: (next: string[]) => void,
  ) => {
    if (items.includes(value)) {
      setter(items.filter((item) => item !== value));
      return;
    }
    setter([...items, value]);
  };

  const getScrollRowElement = (row: "months" | "holidays") =>
    row === "months" ? monthsScrollRef.current : holidaysScrollRef.current;

  const handleRowPointerDown = (
    row: "months" | "holidays",
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    const element = getScrollRowElement(row);
    if (!element) return;
    dragMetaRef.current = {
      row,
      isDown: true,
      startX: event.clientX,
      startScrollLeft: element.scrollLeft,
    };
    ignoreTapRef.current = false;
  };

  const handleRowPointerMove = (
    row: "months" | "holidays",
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    const meta = dragMetaRef.current;
    if (!meta.isDown || meta.row !== row) return;
    const element = getScrollRowElement(row);
    if (!element) return;
    const deltaX = event.clientX - meta.startX;
    if (Math.abs(deltaX) > 6) {
      ignoreTapRef.current = true;
    }
    element.scrollLeft = meta.startScrollLeft - deltaX;
  };

  const handleRowPointerUp = () => {
    dragMetaRef.current.isDown = false;
    dragMetaRef.current.row = null;
    if (ignoreTapRef.current) {
      setTimeout(() => {
        ignoreTapRef.current = false;
      }, 120);
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-[480px] bg-[#F8FAFC]">
      <header className="fixed inset-x-0 top-0 z-40 flex justify-center bg-[#F8FAFC]/95 backdrop-blur">
        <div className="w-full max-w-[480px] px-4 pb-3 pt-4">
          <div className="grid grid-cols-[40px_1fr_40px] items-center">
            <button
              type="button"
              onClick={() => {
                triggerTapFeedback();
                navigate(-1);
              }}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-700 shadow-[0_2px_8px_rgba(15,23,42,0.06)] transition-all duration-150 ease-out active:scale-95"
            >
              <ArrowLeft size={18} />
            </button>
            <h1 className="text-center text-[21px] font-semibold tracking-tight text-[#0F172A]">
              Buscar passagens
            </h1>
            <div />
          </div>
        </div>
      </header>

      <main className="px-4 pb-28 pt-24">
        <div className="space-y-6">
          <section className="rounded-[20px] bg-white p-3.5 shadow-[0_2px_10px_rgba(15,23,42,0.05)]">
            <div className="grid grid-cols-[1fr_40px_1fr] items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  triggerTapFeedback();
                  setAirportPickerTarget("origin");
                }}
                className="rounded-2xl bg-[#F8FAFC] px-3 py-3 text-left transition-all duration-150 ease-out active:scale-[0.99]"
              >
                <p className="text-[12px] font-medium text-[#94A3B8]">
                  Saindo de
                </p>
                <p className="mt-0.5 truncate text-[16px] font-medium text-[#0F172A]">
                  {origin ? formatAirportLabel(origin) : "Selecione origem"}
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  triggerTapFeedback();
                  swapOriginDestination();
                }}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-700 shadow-[0_2px_8px_rgba(15,23,42,0.06)] transition-all duration-150 ease-out active:scale-95"
                aria-label="Inverter origem e destino"
              >
                <ArrowLeftRight size={16} />
              </button>

              <button
                type="button"
                onClick={() => {
                  triggerTapFeedback();
                  setAirportPickerTarget("destination");
                }}
                className="rounded-2xl bg-[#F8FAFC] px-3 py-3 text-left transition-all duration-150 ease-out active:scale-[0.99]"
              >
                <p className="text-[12px] font-medium text-[#94A3B8]">
                  Destino
                </p>
                <p className="mt-0.5 truncate text-[16px] font-medium text-[#0F172A]">
                  {destination ? formatAirportLabel(destination) : "Selecione destino"}
                </p>
              </button>
            </div>
          </section>

          <section className="rounded-[20px] bg-white p-2 shadow-[0_2px_10px_rgba(15,23,42,0.05)]">
            <div className="relative grid grid-cols-2 rounded-full bg-[#E2E8F0] p-1">
              <span
                className={`pointer-events-none absolute bottom-1 top-1 z-0 w-[calc(50%-4px)] rounded-full bg-[#0EA5A4] transition-transform duration-200 ease-out ${
                  mode === "money" ? "translate-x-[calc(100%+4px)]" : "translate-x-0"
                }`}
              />
              <button
                type="button"
                onClick={() => {
                  triggerTapFeedback();
                  setMode("points");
                }}
                className={`rounded-full px-6 py-1.5 text-sm font-semibold transition-all duration-200 ease-out ${
                  mode === "points" ? "z-10 text-white" : "z-10 text-slate-600"
                }`}
              >
                Pontos
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerTapFeedback();
                  setMode("money");
                }}
                className={`rounded-full px-6 py-1.5 text-sm font-semibold transition-all duration-200 ease-out ${
                  mode === "money" ? "z-10 text-white" : "z-10 text-slate-600"
                }`}
              >
                Dinheiro
              </button>
            </div>
          </section>

          <section>
            <button
              type="button"
              onClick={() => {
                triggerTapFeedback();
                setIsPassengersDrawerOpen(true);
              }}
              className="w-full rounded-[20px] bg-white px-4 py-3.5 text-left shadow-[0_2px_10px_rgba(15,23,42,0.05)] transition-all duration-150 ease-out active:scale-[0.99]"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[12px] font-medium text-[#94A3B8]">
                    Passageiros
                  </p>
                  <p className="mt-0.5 text-[16px] font-medium text-[#0F172A]">
                    {passengerSummary}
                  </p>
                </div>
                <ChevronRight size={16} className="text-slate-400" />
              </div>
            </button>
          </section>

          <section className="rounded-[20px] bg-white p-3 shadow-[0_2px_10px_rgba(15,23,42,0.05)]">
            <button
              type="button"
              onClick={() => {
                triggerTapFeedback();
                setIsAdvancedFiltersOpen((prev) => !prev);
              }}
              className="flex w-full items-center justify-between rounded-xl bg-[#F8FAFC] px-3 py-2.5 text-left"
            >
              <div>
                <p className="text-[12px] font-medium text-[#94A3B8]">Filtro avançado</p>
                <p className="text-[15px] font-medium text-[#0F172A]">
                  Classe, período do ano e feriados
                </p>
              </div>
              {isAdvancedFiltersOpen ? (
                <ChevronUp size={16} className="text-slate-400" />
              ) : (
                <ChevronDown size={16} className="text-slate-400" />
              )}
            </button>

            {isAdvancedFiltersOpen && (
              <div className="mt-3 space-y-4">
                <div>
                  <p className="mb-2 text-[12px] font-medium text-[#94A3B8]">Classe</p>
                  <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                    {[
                      { id: "economica", label: "Econômica" },
                      { id: "executiva", label: "Executiva" },
                    ].map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => {
                          triggerTapFeedback();
                          setCabinClass(option.id as typeof cabinClass);
                        }}
                        className={`rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition-all duration-200 ease-out active:scale-95 ${
                          cabinClass === option.id
                            ? "bg-[#0EA5A4] text-white"
                            : "bg-[#E2E8F0] text-slate-600"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        triggerTapFeedback();
                        setCabinClass("economica");
                        setSelectedMonths([]);
                        setSelectedHolidays([]);
                      }}
                      className="rounded-full bg-[#E2E8F0] px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 transition-all duration-150 ease-out active:scale-95"
                    >
                      Limpar
                    </button>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-[12px] font-medium text-[#94A3B8]">
                    Período do ano
                  </p>
                  <div
                    ref={monthsScrollRef}
                    className="flex gap-2 overflow-x-auto overscroll-x-contain pb-1 whitespace-nowrap scrollbar-hide touch-pan-x select-none [-webkit-overflow-scrolling:touch]"
                    onPointerDown={(event) => handleRowPointerDown("months", event)}
                    onPointerMove={(event) => handleRowPointerMove("months", event)}
                    onPointerUp={handleRowPointerUp}
                    onPointerCancel={handleRowPointerUp}
                    onPointerLeave={handleRowPointerUp}
                  >
                    {MONTH_OPTIONS.map((month) => {
                      const active = selectedMonths.includes(month);
                      return (
                        <button
                          key={month}
                          type="button"
                          onClick={() => {
                            if (ignoreTapRef.current) return;
                            triggerTapFeedback();
                            toggleArrayItem(month, selectedMonths, setSelectedMonths);
                          }}
                          className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium transition-all duration-150 ease-out ${
                            active ? "bg-[#0EA5A4] text-white" : "bg-[#E2E8F0] text-slate-600"
                          }`}
                        >
                          {month}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-[12px] font-medium text-[#94A3B8]">
                    Feriados nacionais
                  </p>
                  <div
                    ref={holidaysScrollRef}
                    className="flex gap-2 overflow-x-auto overscroll-x-contain pb-1 whitespace-nowrap scrollbar-hide touch-pan-x select-none [-webkit-overflow-scrolling:touch]"
                    onPointerDown={(event) => handleRowPointerDown("holidays", event)}
                    onPointerMove={(event) => handleRowPointerMove("holidays", event)}
                    onPointerUp={handleRowPointerUp}
                    onPointerCancel={handleRowPointerUp}
                    onPointerLeave={handleRowPointerUp}
                  >
                    {BRAZIL_NATIONAL_HOLIDAYS.map((holiday) => {
                      const active = selectedHolidays.includes(holiday);
                      return (
                        <button
                          key={holiday}
                          type="button"
                          onClick={() => {
                            if (ignoreTapRef.current) return;
                            triggerTapFeedback();
                            toggleArrayItem(
                              holiday,
                              selectedHolidays,
                              setSelectedHolidays,
                            );
                          }}
                          className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium transition-all duration-150 ${
                            active
                              ? "bg-[#0EA5A4] text-white"
                              : "bg-[#E2E8F0] text-slate-600"
                          }`}
                        >
                          {holiday}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[12px] font-medium text-[#94A3B8]">
                Sugestoes
              </p>
              <span className="text-[11px] text-slate-400">dados ficticios</span>
            </div>
            <div className="space-y-3">
              {filteredMockFlights.map((flight) => (
                <button
                  key={flight.id}
                  type="button"
                  onClick={() => {
                    triggerTapFeedback();
                    handleOpenCalendarFromMockFlight(flight);
                  }}
                  className="w-full rounded-[20px] bg-white px-4 py-3.5 text-left shadow-[0_2px_10px_rgba(15,23,42,0.05)] transition-all duration-150 active:scale-[0.99]"
                >
                  <p className="text-[12px] text-[#94A3B8]">
                    {flight.origin}
                  </p>
                  <div className="mt-0.5 flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[17px] font-medium text-[#0F172A]">
                        {flight.destination}
                      </p>
                      <div className="mt-1 flex items-center gap-1.5 text-[12px] text-slate-400">
                        <AirlineLogo airline={flight.airline} size={14} />
                        <span>{flight.airline}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      {mode === "points" ? (
                        <p className="text-[18px] font-semibold text-[#0EA5A4]">
                          {flight.points.toLocaleString("pt-BR")} pts
                        </p>
                      ) : (
                        <p className="text-[18px] font-semibold text-[#0EA5A4]">
                          {formatMoney(flight.money)}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center bg-gradient-to-t from-[#F8FAFC] via-[#F8FAFC] to-transparent pt-6">
        <div className="w-full max-w-[480px] px-4 pb-5">
          <Button
            className="h-14 w-full rounded-full bg-[linear-gradient(135deg,#0EA5A4,#14B8A6)] text-base font-semibold text-white shadow-[0_6px_16px_rgba(14,165,164,0.28)] transition-all duration-150 ease-out hover:brightness-105 active:scale-[0.98]"
            disabled={!canAdvance}
            onClick={() => {
              if (!canAdvance) return;
              triggerTapFeedback();
              navigate("/price-calendar");
            }}
          >
            <Search className="mr-2 h-4 w-4" />
            Ver datas
          </Button>
        </div>
      </div>

      <Drawer
        open={airportPickerTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAirportPickerTarget(null);
            setAirportQuery("");
          }
        }}
      >
        <DrawerContent className="mx-auto w-full max-w-[480px] rounded-t-3xl border-0 bg-[#F5F7F9]">
          <DrawerHeader className="text-left">
            <DrawerTitle>
              {airportPickerTarget === "origin" ? "Escolher origem" : "Escolher destino"}
            </DrawerTitle>
            <DrawerDescription>Busque por cidade, aeroporto ou sigla.</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-5">
            <Input
              value={airportQuery}
              placeholder="Ex.: Sao Paulo, GRU, Lisboa"
              onChange={(event) => setAirportQuery(event.target.value)}
            />
            <div className="mt-3 max-h-[52vh] space-y-1 overflow-y-auto pb-1">
              {filteredAirports.map((airport) => (
                <button
                  key={airport.code}
                  type="button"
                  onClick={() => {
                    triggerTapFeedback();
                    selectAirport(airport);
                  }}
                  className="w-full rounded-2xl bg-white px-3 py-2.5 text-left shadow-[0_4px_12px_rgba(0,0,0,0.04)] transition-all duration-150 ease-out active:scale-[0.99]"
                >
                  <p className="text-sm font-semibold text-slate-900">
                    {airport.city} - {airport.code}
                  </p>
                  <p className="text-xs text-slate-500">
                    {airport.name} • {airport.country}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      <Drawer open={isPassengersDrawerOpen} onOpenChange={setIsPassengersDrawerOpen}>
        <DrawerContent className="mx-auto w-full max-w-[480px] rounded-t-3xl border-0 bg-[#F5F7F9]">
          <DrawerHeader className="text-left">
            <DrawerTitle>Passageiros</DrawerTitle>
            <DrawerDescription>Defina a quantidade por tipo.</DrawerDescription>
          </DrawerHeader>
          <div className="space-y-2 px-4 pb-6">
            {[
              { key: "adult" as const, label: "Adulto", min: 1 },
              { key: "child" as const, label: "Crianca", min: 0 },
              { key: "baby" as const, label: "Bebe", min: 0 },
            ].map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between rounded-2xl bg-white px-3 py-2.5 shadow-[0_4px_12px_rgba(0,0,0,0.04)]"
              >
                <span className="text-sm font-medium text-slate-700">{item.label}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-full border border-slate-200 p-1 transition-all duration-150 ease-out active:scale-95"
                    onClick={() =>
                      (triggerTapFeedback(),
                      setPassengerCount(
                        item.key,
                        Math.max(item.min, passengers[item.key] - 1),
                      ))
                    }
                  >
                    <Minus size={14} />
                  </button>
                  <span className="w-7 text-center text-sm font-semibold text-slate-900">
                    {passengers[item.key]}
                  </span>
                  <button
                    type="button"
                    className="rounded-full border border-slate-200 p-1 transition-all duration-150 ease-out active:scale-95"
                    onClick={() => {
                      triggerTapFeedback();
                      setPassengerCount(item.key, passengers[item.key] + 1);
                    }}
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
};

export default SearchFlightsScreen;
