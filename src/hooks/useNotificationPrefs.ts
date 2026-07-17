import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import { getPromoWhatsappPref, setPromoWhatsappPref } from "@/lib/notifications";

async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Entre novamente.");
  return token;
}

export function useNotificationPrefs() {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const pref = await getPromoWhatsappPref(token);
      setEnabled(pref.enabled);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const toggle = useCallback(
    async (next: boolean) => {
      const prev = enabled;
      setEnabled(next); // otimista
      setSaving(true);
      try {
        const token = await getAccessToken();
        const pref = await setPromoWhatsappPref(token, next);
        setEnabled(pref.enabled);
      } catch (e) {
        setEnabled(prev); // reverte
        throw e; // a tela mostra o toast
      } finally {
        setSaving(false);
      }
    },
    [enabled],
  );

  return { enabled, loading, saving, error, reload, toggle };
}
