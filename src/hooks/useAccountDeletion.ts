import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { cancelarExclusaoConta, solicitarExclusaoConta, type DeletionStatus } from "@/lib/accountDeletion";

export type PendingDeletion = { agendado_para: string } | null;

async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Entre novamente.");
  return token;
}

export function useAccountDeletion() {
  const { user } = useAuth();
  const [pending, setPending] = useState<PendingDeletion>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setPending(null);
      return;
    }
    // Degrada graciosamente se a tabela não existir ainda (pré-migration) ou RLS negar.
    const { data, error } = await supabase
      .from("conta_exclusao_solicitacoes")
      .select("agendado_para, status")
      .eq("usuario_id", user.id)
      .eq("status", "pendente")
      .maybeSingle();
    if (error) {
      setPending(null);
      return;
    }
    setPending(data?.agendado_para ? { agendado_para: data.agendado_para } : null);
  }, [user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const solicitar = useCallback(async (): Promise<DeletionStatus> => {
    setLoading(true);
    try {
      const token = await getAccessToken();
      return await solicitarExclusaoConta(token);
    } finally {
      setLoading(false);
    }
  }, []);

  const cancelar = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const token = await getAccessToken();
      await cancelarExclusaoConta(token);
      await refresh();
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  return { pending, loading, solicitar, cancelar, refresh };
}
