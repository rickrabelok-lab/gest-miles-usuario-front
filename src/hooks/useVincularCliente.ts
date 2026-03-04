import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/** Erro do Supabase com code e message */
function isPostgrestError(e: unknown): e is { code: string; message: string } {
  return !!e && typeof e === "object" && "code" in e && "message" in e;
}

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
      const { error } = await supabase.from("gestor_clientes").insert({
        gestor_id: user.id,
        cliente_id: uuid,
      });
      if (error) {
        const err = new Error(error.message) as Error & { code?: string };
        err.code = error.code;
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gestor_clientes"] });
    },
  });

  return {
    vincular: mutation.mutateAsync,
    vincularStatus: mutation.status,
    vincularError: mutation.error,
    isVincularLoading: mutation.isPending,
    getErrorMessage: (err: unknown): string => {
      if (isPostgrestError(err)) {
        if (err.code === "23505") return "Este cliente já está vinculado a um gestor.";
        if (err.code === "42501" || err.message.includes("row-level security") || err.message.includes("policy")) {
          return "Sem permissão. Aplique a migration que permite gestor vincular cliente (gestor_clientes_insert_own_or_admin).";
        }
        if (err.code === "23503") return "ID do cliente não encontrado. Confira se o UUID está correto.";
        return err.message;
      }
      return err instanceof Error ? err.message : "Não foi possível vincular.";
    },
  };
};
