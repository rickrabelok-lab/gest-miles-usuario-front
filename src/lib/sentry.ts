import * as Sentry from "@sentry/react";

let initialized = false;

// PII/segredos óbvios que não devem sair do browser num evento de erro.
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._-]+/gi;
const JWT_RE = /\beyJ[A-Za-z0-9._-]{10,}/g; // access/refresh token Supabase, magic-link
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const CPF_RE = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;

/**
 * Remove PII/segredos óbvios (token Bearer/JWT, e-mail, CPF) de uma string antes de
 * enviar ao Sentry. Pura e testável. A ordem importa: Bearer antes do JWT (o token do
 * header também casaria o JWT_RE), e-mail/CPF por último.
 */
export function scrubPii(value: string): string {
  if (typeof value !== "string" || !value) return value;
  return value
    .replace(BEARER_RE, "Bearer [REDACTED]")
    .replace(JWT_RE, "[REDACTED_TOKEN]")
    .replace(EMAIL_RE, "[REDACTED_EMAIL]")
    .replace(CPF_RE, "[REDACTED_CPF]");
}

type ScrubbableEvent = {
  message?: string;
  exception?: { values?: Array<{ value?: string }> };
  request?: { url?: string; query_string?: unknown };
  breadcrumbs?: Array<{ message?: unknown }>;
};

/** Aplica scrubPii nos campos do evento que tipicamente carregam texto livre. Muta e retorna. */
export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  if (typeof event.message === "string") event.message = scrubPii(event.message);
  for (const exception of event.exception?.values ?? []) {
    if (typeof exception.value === "string") exception.value = scrubPii(exception.value);
  }
  if (event.request) {
    if (typeof event.request.url === "string") event.request.url = scrubPii(event.request.url);
    if (typeof event.request.query_string === "string") {
      event.request.query_string = scrubPii(event.request.query_string);
    }
  }
  for (const crumb of event.breadcrumbs ?? []) {
    if (typeof crumb.message === "string") crumb.message = scrubPii(crumb.message);
  }
  return event;
}

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
    // Belt-and-suspenders: além de sendDefaultPii:false + sem setUser, raspa PII/token
    // que possa ter vazado para uma mensagem de erro ou breadcrumb.
    beforeSend: (event) => scrubEvent(event),
  });
  Sentry.setTag("app", "usuario-front");
  initialized = true;
}

export { Sentry };
