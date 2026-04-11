import type { AppRole } from "@/lib/roles";

/**
 * Home no app de utilizadores (só clientes). CS/gestor/admin usam outros fronts — ver `staffAppUrls.ts`.
 */
export function homePathForRole(_role: AppRole | null): string {
  return "/";
}
