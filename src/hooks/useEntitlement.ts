import { useAuth } from "@/contexts/AuthContext";
import { entitlementOf, isPaid, type Entitlement } from "@/lib/entitlement";

export function useEntitlement(): { entitlement: Entitlement; isPaid: boolean; loading: boolean } {
  const { planoAtivo, subscriptionStatus, subscriptionPeriodEnd, roleLoading } = useAuth();
  return {
    entitlement: entitlementOf(planoAtivo, subscriptionStatus, subscriptionPeriodEnd),
    isPaid: isPaid(planoAtivo, subscriptionStatus, subscriptionPeriodEnd),
    loading: roleLoading,
  };
}
