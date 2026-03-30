import { Gift } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import BonusOfferCard from "@/components/bonus/BonusOfferCard";
import BonusOfferCardSkeleton from "@/components/bonus/BonusOfferCardSkeleton";
import TopStoreCard from "@/components/bonus/TopStoreCard";
import { Button } from "@/components/ui/button";
import { useBonusOffers } from "@/hooks/useBonusOffers";
import type { LoyaltyProgram } from "@/lib/bonus-offers/types";

type ProgramFilter = "Todos" | LoyaltyProgram;

const FILTERS: ProgramFilter[] = [
  "Todos",
  "Livelo",
  "Smiles",
  "LATAM Pass",
  "Azul Fidelidade",
];

const BonusOffersScreen = () => {
  const [activeFilter, setActiveFilter] = useState<ProgramFilter>("Todos");
  const selectedProgram = activeFilter === "Todos" ? undefined : activeFilter;
  const { offers, loading, error, retry } = useBonusOffers(selectedProgram);

  const topStores = useMemo(() => {
    const map = new Map<string, number>();
    offers.forEach((offer) => {
      const current = map.get(offer.store) ?? 0;
      if (offer.multiplier > current) map.set(offer.store, offer.multiplier);
    });
    return [...map.entries()]
      .map(([store, bestMultiplier]) => ({ store, bestMultiplier }))
      .sort((a, b) => b.bestMultiplier - a.bestMultiplier)
      .slice(0, 6);
  }, [offers]);

  return (
    <div className="mx-auto min-h-screen max-w-[480px] bg-[#F5F7F9] px-4 pb-10 pt-6">
      <header className="mb-5">
        <div className="flex items-center gap-2">
          <Gift size={18} className="text-[#0EA5A4]" />
          <h1 className="text-[22px] font-semibold text-[#1E293B]">Compras Bonificadas</h1>
        </div>
        <p className="mt-1 text-[13px] text-slate-500">
          Ganhe mais pontos comprando nas lojas parceiras
        </p>
      </header>

      <section className="mb-5 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {FILTERS.map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => setActiveFilter(filter)}
            className={`shrink-0 rounded-full px-4 py-2 text-[13px] font-medium transition-all duration-150 ${
              activeFilter === filter
                ? "bg-[#0EA5A4] text-white"
                : "bg-[#E2E8F0] text-slate-600"
            }`}
          >
            {filter}
          </button>
        ))}
      </section>

      <section className="space-y-4">
        {loading && (
          <>
            <BonusOfferCardSkeleton />
            <BonusOfferCardSkeleton />
            <BonusOfferCardSkeleton />
          </>
        )}

        {!loading && error && (
          <div className="rounded-[20px] bg-white p-4 text-center shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
            <p className="text-sm text-slate-600">{error}</p>
            <Button
              className="mt-3 h-9 rounded-full bg-[#0EA5A4] px-4 text-white"
              onClick={() => void retry()}
            >
              Tentar novamente
            </Button>
          </div>
        )}

        {!loading && !error && offers.length === 0 && (
          <div className="rounded-[20px] bg-white p-4 text-center shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
            <p className="text-sm text-slate-600">Nenhuma oferta ativa para este programa.</p>
          </div>
        )}

        {!loading &&
          !error &&
          offers.map((offer) => (
            <BonusOfferCard
              key={offer.id}
              offer={offer}
              onAccessOffer={(url) => {
                toast.success(`Redirecionando para oferta: ${url}`);
              }}
            />
          ))}
      </section>

      <section className="mt-7">
        <h2 className="mb-3 text-[18px] font-semibold text-[#1E293B]">Principais Lojas</h2>
        <div className="grid grid-cols-2 gap-3">
          {topStores.map((store) => (
            <TopStoreCard
              key={store.store}
              store={store.store}
              bestMultiplier={store.bestMultiplier}
            />
          ))}
        </div>
      </section>
    </div>
  );
};

export default BonusOffersScreen;
