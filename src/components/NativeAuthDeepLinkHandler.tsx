import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { isNativePlatform, parseAuthCallbackUrl } from "@/lib/nativeAuth";
import { supabase } from "@/lib/supabase";

/**
 * Recebe o retorno de OAuth/links de e-mail no app nativo (deep link
 * br.com.gestmiles.app://auth-callback) e estabelece a sessão.
 * Na web não registra nada (no-op).
 */
const NativeAuthDeepLinkHandler = () => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isNativePlatform()) return;

    let disposed = false;
    let removeListener: (() => void) | null = null;
    const handledUrls = new Set<string>();

    const closeBrowser = async () => {
      try {
        const { Browser } = await import("@capacitor/browser");
        await Browser.close();
      } catch {
        // Browser.close() não é implementado em todo Android; o deep link já traz o app pra frente.
      }
    };

    const handleUrl = async (url: string) => {
      const parsed = parseAuthCallbackUrl(url);
      if (parsed.kind === "ignore") return;
      // No cold start o mesmo deep link pode chegar por getLaunchUrl E appUrlOpen.
      if (handledUrls.has(url)) return;
      handledUrls.add(url);

      await closeBrowser();

      if (parsed.kind === "error") {
        toast.error("Não foi possível concluir o login.", { description: parsed.message });
        navigate("/auth", { replace: true });
        return;
      }

      try {
        if (parsed.kind === "code") {
          const { error } = await supabase.auth.exchangeCodeForSession(parsed.code);
          if (error) throw error;
        } else {
          const { error } = await supabase.auth.setSession({
            access_token: parsed.accessToken,
            refresh_token: parsed.refreshToken,
          });
          if (error) throw error;
        }
        navigate("/me", { replace: true });
      } catch (err) {
        console.warn("[NativeAuthDeepLink] falha ao estabelecer sessão:", err);
        toast.error("Não foi possível concluir o login. Tente novamente.");
        navigate("/auth", { replace: true });
      }
    };

    void (async () => {
      const { App: CapacitorApp } = await import("@capacitor/app");

      const handle = await CapacitorApp.addListener("appUrlOpen", (event) => {
        void handleUrl(event.url);
      });
      if (disposed) {
        void handle.remove();
        return;
      }
      removeListener = () => void handle.remove();

      // App fechado + deep link = cold start: o evento pode disparar antes do
      // listener existir; getLaunchUrl cobre esse caminho (o Set deduplica).
      const launch = await CapacitorApp.getLaunchUrl();
      if (launch?.url) void handleUrl(launch.url);
    })();

    return () => {
      disposed = true;
      removeListener?.();
    };
  }, [navigate]);

  return null;
};

export default NativeAuthDeepLinkHandler;
