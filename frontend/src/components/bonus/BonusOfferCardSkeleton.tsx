import { Skeleton } from "@/components/ui/skeleton";

const BonusOfferCardSkeleton = () => (
  <div className="rounded-[20px] bg-white p-4 shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
    <Skeleton className="h-7 w-36 rounded-full" />
    <Skeleton className="mt-3 h-10 w-28 rounded-xl" />
    <Skeleton className="mt-3 h-6 w-48 rounded-md" />
    <Skeleton className="mt-2 h-4 w-32 rounded-md" />
    <Skeleton className="mt-2 h-4 w-full rounded-md" />
    <Skeleton className="mt-4 h-10 w-full rounded-full" />
  </div>
);

export default BonusOfferCardSkeleton;
