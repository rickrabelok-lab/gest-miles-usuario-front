import * as Sentry from "@sentry/node";

let initialized = false;

/** Inicializa o Sentry só se houver SENTRY_DSN (no-op sem env). Reusa o projeto do manager,
 *  separado por environment/tag. */
export function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || initialized) return;
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENV || "usuario-backend",
    tracesSampleRate: 0.1,
  });
  Sentry.setTag("app", "usuario-backend");
  initialized = true;
}

/** Captura um erro no Sentry se inicializado. Best-effort: nunca lança. */
export function captureException(err) {
  try {
    if (initialized) Sentry.captureException(err);
  } catch {
    /* ignore */
  }
}
