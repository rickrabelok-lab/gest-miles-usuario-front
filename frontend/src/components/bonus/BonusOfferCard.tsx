import { memo } from "react";
import { Button } from "@/components/ui/button";
import type { BonusOffer } from "@/lib/bonus-offers/types";

type BonusOfferCardProps = {
  offer: BonusOffer;
  onAccessOffer: (url: string) => void;
};

const initials = (text: string) =>
  text
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const BonusOfferCard = ({ offer, onAccessOffer }: BonusOfferCardProps) => {
  const highlight = offer.multiplier >= 10;
  const badge = offer.multiplier >= 15;

  return (
    <article
      className={`rounded-[20px] bg-white p-4 shadow-[0_4px_12px_rgba(0,0,0,0.04)] ${
        highlight ? "ring-1 ring-[#0EA5A4]/20" : ""
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-2.5 py-1">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-700">
            {initials(offer.program)}
          </span>
          <span className="text-[11px] font-medium text-slate-600">{offer.program}</span>
        </div>
        {badge && (
          <span className="rounded-full bg-orange-100 px-2 py-1 text-[11px] font-medium text-orange-700">
            🔥 Oferta em destaque
          </span>
        )}
      </div>

      <div className="mb-2 inline-flex items-center rounded-xl bg-slate-50 px-3 py-2">
        <span className="text-sm font-semibold text-slate-800">{offer.store}</span>
      </div>

      <p className="text-[18px] font-semibold text-[#0EA5A4]">
        Até {offer.multiplier} pontos por real
      </p>
      <p className="mt-1 text-[12px] text-slate-500">
        Válido até {new Date(offer.validUntil).toLocaleDateString("pt-BR")}
      </p>
      <p className="mt-2 text-[12px] text-slate-500">{offer.conditions}</p>

      <Button
        className="mt-4 h-10 w-full rounded-full bg-[linear-gradient(135deg,#0EA5A4,#14B8A6)] text-white"
        onClick={() => onAccessOffer(offer.offerUrl)}
      >
        Acessar oferta
      </Button>
    </article>
  );
};

export default memo(BonusOfferCard);
