import type { JSX } from "react";
import { B2C_PLAN_GATE_ENABLED } from "@/config/features";
import { useEntitlement } from "@/hooks/useEntitlement";
import PlanoInativoScreen from "@/components/PlanoInativoScreen";

/** Mostra o conteúdo só p/ cliente pago; free vê o upsell. Inerte se a flag estiver off. */
export default function RequirePaid({ children }: { children: JSX.Element }) {
  const { isPaid, loading } = useEntitlement();
  if (!B2C_PLAN_GATE_ENABLED) return children; // gating desligado
  if (loading) return children; // não bloqueia enquanto carrega
  if (!isPaid) return <PlanoInativoScreen />; // free => upsell
  return children;
}
