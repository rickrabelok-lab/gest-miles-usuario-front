import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

export type LogAcaoRow = {
  id: string;
  user_id: string;
  tipo_acao: string;
  entidade_afetada: string;
  entidade_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

export const useGestorLogs = (enabled = true) => {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["gestor_logs_acoes", user?.id],
    enabled: enabled && !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("logs_acoes")
        .select("id, user_id, tipo_acao, entidade_afetada, entidade_id, details, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as LogAcaoRow[];
    },
  });

  return {
    logs: query.data ?? [],
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
};
