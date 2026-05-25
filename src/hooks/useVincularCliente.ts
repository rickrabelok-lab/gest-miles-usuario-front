import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/** Erro do Supabase com code e message */
function isPostgrestError(e: unknown): e is { code: string; message: string } {
  return !!e && typeof e === "object" && "code" in e && "message" in e;
}

const USER_SAFE_LINK_CLIENT_ERRORS = new Set([
  "ID inválido. Use o UUID completo do cliente (ex: 8c69e773-a81e-4710-82a3-9a1b716471ba).",
  "Faça login novamente para vincular clientes.",
  "ID do cliente inválido. Use o UUID completo.",
  "Faça login novamente para desvincular.",
]);

export const useVincularCliente = (gestorUserId: string | undefined) => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (clienteId: string) => {
      const uuid = clienteId.trim().toLowerCase();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)) {
        throw new Error("ID inválido. Use o UUID completo do cliente (ex: 8c69e773-a81e-4710-82a3-9a1b716471ba).");
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) throw new Error("Faça login novamente para vincular clientes.");
      const { error } = await supabase.rpc("gestor_vincular_cliente_self", {
        p_cliente_id: uuid,
      });
      if (error) {
        const err = new Error(error.message) as Error & { code?: string };
        err.code = error.code;
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cliente_gestores"] });
    },
  });

  const desvincularMutation = useMutation({
    mutationFn: async (clienteId: string) => {
      const raw = clienteId.trim();
      const uuid = raw.toLowerCase();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
        throw new Error("ID do cliente inválido. Use o UUID completo.");
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) throw new Error("Faça login novamente para desvincular.");
      const { data, error } = await supabase.rpc("gestor_desvincular_cliente_self", {
        p_cliente_id: uuid,
      });
      if (error) {
        const err = new Error(error.message) as Error & { code?: string };
        err.code = error.code;
        throw err;
      }
      return { deleted: Number(data ?? 0) > 0 };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cliente_gestores"] });
      queryClient.invalidateQueries({ queryKey: ["cliente_gestores_perfis"] });
    },
  });

  return {
    vincular: mutation.mutateAsync,
    desvincular: desvincularMutation.mutateAsync,
    isDesvincularLoading: desvincularMutation.isPending,
    vincularStatus: mutation.status,
    vincularError: mutation.error,
    isVincularLoading: mutation.isPending,
    getErrorMessage: (err: unknown): string => {
      if (isPostgrestError(err)) {
        if (err.code === "23505") return "Este cliente já está vinculado a você.";
        if (err.code === "42501" || err.message.includes("row-level security") || err.message.includes("policy")) {
          return "Sem permissão para vincular este cliente.";
        }
        if (err.code === "23503") return "ID do cliente não encontrado. Confira se o UUID está correto.";
        console.warn("[useVincularCliente] cliente link RPC failed", err);
        return "Não foi possível atualizar o vínculo do cliente agora.";
      }
      if (err instanceof Error && USER_SAFE_LINK_CLIENT_ERRORS.has(err.message)) {
        return err.message;
      }
      if (err instanceof Error) {
        console.warn("[useVincularCliente] cliente link failed", err);
      }
      return "Não foi possível atualizar o vínculo do cliente agora.";
    },
  };
};
