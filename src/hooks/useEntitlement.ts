import { useAuth } from "@/contexts/AuthContext";
import { entitlementOf, isPaid, type Entitlement } from "@/lib/entitlement";

export function useEntitlement(): { entitlement: Entitlement; isPaid: boolean; loading: boolean } {
  const { planoAtivo, subscriptionStatus, roleLoading } = useAuth();
  return {
    entitlement: entitlementOf(planoAtivo, subscriptionStatus),
    isPaid: isPaid(planoAtivo, subscriptionStatus),
    loading: roleLoading,
  };
}
