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

/** Alinhado com `@gest/core` — tipo de ação para log “visualizou cliente”. */
export function tipoLogVisualizacaoCliente(role: AppRole | null): string {
  switch (role) {
    case "cs":
      return "cs_visualizou_cliente";
    case "admin_equipe":
      return "admin_equipe_visualizou_cliente";
    case "admin":
      return "admin_visualizou_cliente";
    default:
      return "gestor_visualizou_cliente";
  }
}
