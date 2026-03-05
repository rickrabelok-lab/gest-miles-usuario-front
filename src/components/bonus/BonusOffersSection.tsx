import { useNavigate } from "react-router-dom";
import { useMemo, useRef } from "react";
import BonusOfferCardSkeleton from "@/components/bonus/BonusOfferCardSkeleton";
import { useBonusOffers } from "@/hooks/useBonusOffers";

const programShortName = (program: string) => {
  if (program === "Azul Fidelidade") return "TudoAzul";
  return program;
};

const MAIN_PROGRAMS = ["LATAM Pass", "Azul Fidelidade", "Livelo", "Smiles"] as const;

const BonusOffersSection = () => {
  const navigate = useNavigate();
  const { offers, loading, error } = useBonusOffers();
  const cardsRowRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef({
    isDown: false,
    startX: 0,
    startScrollLeft: 0,
  });

  const programHighlightsMap = useMemo(() => {
    const map = new Map<string, number>();
    offers.forEach((offer) => {
      const current = map.get(offer.program) ?? 0;
      if (offer.multiplier > current) map.set(offer.program, offer.multiplier);
    });
    return map;
  }, [offers]);

  const topStores = useMemo(() => {
    const map = new Map<string, { bestMultiplier: number; program: string }>();
    offers.forEach((offer) => {
      const current = map.get(offer.store);
      if (!current || offer.multiplier > current.bestMultiplier) {
        map.set(offer.store, {
          bestMultiplier: offer.multiplier,
          program: offer.program,
        });
      }
    });

    return [...map.entries()]
      .map(([store, value]) => ({
        store,
        bestMultiplier: value.bestMultiplier,
        program: value.program,
      }))
      .sort((a, b) => b.bestMultiplier - a.bestMultiplier)
      .slice(0, 10);
  }, [offers]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const element = cardsRowRef.current;
    if (!element) return;
    dragRef.current.isDown = true;
    dragRef.current.startX = event.clientX;
    dragRef.current.startScrollLeft = element.scrollLeft;
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const element = cardsRowRef.current;
    if (!element || !dragRef.current.isDown) return;
    const deltaX = event.clientX - dragRef.current.startX;
    element.scrollLeft = dragRef.current.startScrollLeft - deltaX;
  };

  const handlePointerUp = () => {
    dragRef.current.isDown = false;
  };

  return (
    <section className="px-5 pb-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-[#1E293B]">Compras Bonificadas</h3>
          <p className="text-xs text-slate-500">
            Ganhe mais pontos com ofertas ativas dos programas.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/bonus-offers")}
          className="rounded-full bg-[#E2E8F0] px-3 py-1.5 text-xs font-medium text-slate-600"
        >
          Ver tudo
        </button>
      </div>

      <div className="space-y-4">
        {loading && (
          <>
            <BonusOfferCardSkeleton />
            <BonusOfferCardSkeleton />
          </>
        )}

        {!loading && error && (
          <div className="rounded-2xl bg-white p-4 text-center shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
            <p className="text-sm text-slate-500">Não foi possível carregar as ofertas.</p>
          </div>
        )}

        {!loading && !error && (
          <div
            ref={cardsRowRef}
            className="flex gap-3 overflow-x-auto overscroll-x-contain pb-1 scrollbar-hide touch-pan-x select-none [-webkit-overflow-scrolling:touch]"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            <article className="w-[84%] shrink-0 rounded-[20px] bg-white p-4 shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
              <p className="mb-2 text-[12px] font-medium text-[#94A3B8]">Programas</p>
              <div className="grid grid-cols-2 gap-2">
                {MAIN_PROGRAMS.map((program) => (
                  <button
                    key={program}
                    type="button"
                    onClick={() => navigate("/bonus-offers")}
                    className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-left shadow-[0_2px_6px_rgba(15,23,42,0.05)]"
                  >
                    <p className="text-[13px] font-semibold text-slate-800">
                      {programShortName(program)}
                    </p>
                    <p className="mt-0.5 text-[12px] text-slate-600">
                      Até{" "}
                      <span className="font-semibold text-[#0EA5A4]">
                        {programHighlightsMap.get(program) ?? "--"}x
                      </span>
                    </p>
                  </button>
                ))}
              </div>
            </article>

            <article className="w-[84%] shrink-0 rounded-[20px] bg-white p-4 shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
              <p className="mb-2 text-[12px] font-medium text-[#94A3B8]">Lojas</p>
              <div className="grid grid-cols-2 gap-2">
                {topStores.slice(0, 4).map((store) => (
                  <button
                    key={store.store}
                    type="button"
                    onClick={() => navigate("/bonus-offers")}
                    className="rounded-xl bg-[#F8FAFC] px-2.5 py-2 text-left"
                  >
                    <p className="text-[13px] font-semibold text-slate-800">{store.store}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {programShortName(store.program)} •{" "}
                      <span className="font-semibold text-[#0EA5A4]">até {store.bestMultiplier}x</span>
                    </p>
                  </button>
                ))}
              </div>
            </article>
          </div>
        )}
      </div>
    </section>
  );
};

export default BonusOffersSection;
