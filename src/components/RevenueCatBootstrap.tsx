import { useEffect, useRef } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { ensureRevenueCatUser, isRevenueCatAvailable, logOutRevenueCat } from "@/lib/revenuecat";

/**
 * Ata o ciclo de vida do RevenueCat ao login: appUserID = user.id do Supabase
 * (é o elo compra -> perfis usado pelo webhook). Sem UI; no web/sem key é no-op.
 */
const RevenueCatBootstrap = () => {
  const { user } = useAuth();
  const lastUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isRevenueCatAvailable()) return;
    const userId = user?.id ?? null;
    if (userId === lastUserIdRef.current) return;
    lastUserIdRef.current = userId;

    if (userId) {
      void ensureRevenueCatUser(userId).catch((err) =>
        console.warn("[RevenueCatBootstrap] configure:", err),
      );
    } else {
      void logOutRevenueCat();
    }
  }, [user?.id]);

  return null;
};

export default RevenueCatBootstrap;
