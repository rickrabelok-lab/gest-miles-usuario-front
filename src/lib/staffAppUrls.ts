import type { AppRole } from "@/lib/roles";

/**
 * URLs dos outros fronts (definir em .env.local em produção).
 * Desenvolvimento local: Manager costuma ser :3081; Admin (monorepo admin) costuma ser :3000 — ajuste se necessário.
 */
export function managerAppBaseUrl(): string {
  return (import.meta.env.VITE_MANAGER_APP_URL ?? "http://localhost:3081").replace(/\/$/, "");
}

export function adminAppBaseUrl(): string {
  return (import.meta.env.VITE_ADMIN_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** CS, gestor e admin de equipe → painel Manager. */
export function managerOperationalRoles(): AppRole[] {
  return ["cs", "gestor", "admin_equipe"];
}

/**
 * Se o papel deve usar outro front (não o app de clientes), devolve a base URL (sem barra final).
 * `null` = pode usar o app de utilizadores (cliente / cliente_gestao).
 */
export function staffWebAppBaseUrlForRole(role: AppRole | null): string | null {
  if (!role) return null;
  if (role === "admin") {
    return adminAppBaseUrl();
  }
  if (managerOperationalRoles().includes(role)) return managerAppBaseUrl();
  return null;
}

/** URL de login no painel Manager ou Admin (o Admin usa `/login`, o Manager `/auth`). */
export function staffAppEntryUrl(role: AppRole | null): string | null {
  const base = staffWebAppBaseUrlForRole(role);
  if (!base) return null;
  if (role === "admin") return `${base}/login`;
  return `${base}/auth`;
}

export function isClienteAppRole(role: AppRole | null): boolean {
  return role === "cliente" || role === "cliente_gestao";
}
