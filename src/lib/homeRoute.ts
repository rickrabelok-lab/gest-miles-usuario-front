import type { AppRole } from "@/lib/roles";

/**
 * Destino pós-login / onboarding no app de clientes (admin usa o painel Admin externo).
 */
export function homePathForRole(_role: AppRole | null): string {
  return "/";
}
