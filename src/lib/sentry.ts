import * as Sentry from "@sentry/react";

let initialized = false;

/** Inicializa o Sentry só se houver DSN (no-op sem env). Reusa o projeto do manager,
 *  separado por environment/tag. */
export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn || initialized) return;
  Sentry.init({
    dsn,
    environment: (import.meta.env.VITE_SENTRY_ENV as string | undefined) || "usuario-front",
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
  Sentry.setTag("app", "usuario-front");
  initialized = true;
}

export { Sentry };
