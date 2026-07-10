import { lazy } from "react";

import { isNativePlatform } from "@/lib/nativeAuth";

const AssinaturaClientePage = lazy(() => import("./AssinaturaClientePage"));
const AssinaturaAppScreen = lazy(() => import("./AssinaturaAppScreen"));

/** /assinatura por plataforma: app nativo = loja (IAP); web = Stripe (inalterada). */
const AssinaturaRoute = () =>
  isNativePlatform() ? <AssinaturaAppScreen /> : <AssinaturaClientePage />;

export default AssinaturaRoute;
