/**
 * Manter alinhado com `gest-miles-manager-front/packages/core/src/roles.ts`.
 */

export type OperationalRole = "cs" | "gestor" | "admin_equipe";

export const OPERATIONAL_ROLES: ReadonlyArray<OperationalRole> = ["cs", "gestor", "admin_equipe"];

export type AppRole =
  | "admin"
  | OperationalRole
  | "cliente"
  | "cliente_gestao";

export function normalizeManagerRole(raw: unknown): OperationalRole | null {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (value === "cs" || value === "gestor" || value === "admin_equipe") return value;
  return null;
}

export function isOperationalRole(raw: unknown): boolean {
  return normalizeManagerRole(raw) != null;
}

export function mapPerfilRoleForOperationalUi(raw: unknown): AppRole {
  const r = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (r === "admin") return "admin";
  const operational = normalizeManagerRole(r);
  if (operational) return operational;
  if (r === "cliente" || r === "cliente_gestao") return r as AppRole;
  return "cliente";
}
