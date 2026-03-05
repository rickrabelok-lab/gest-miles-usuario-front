import { memo } from "react";

type TopStoreCardProps = {
  store: string;
  bestMultiplier: number;
};

const TopStoreCard = ({ store, bestMultiplier }: TopStoreCardProps) => (
  <article className="rounded-2xl bg-white p-3 shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
    <p className="text-sm font-semibold text-slate-800">{store}</p>
    <p className="mt-1 text-[13px] text-[#0EA5A4]">Até {bestMultiplier}x</p>
  </article>
);

export default memo(TopStoreCard);
