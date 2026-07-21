import { useEffect, useState } from "react";
import { COOKIE_NOTICE_DISMISSED_KEY } from "@/lib/authFlowStorage";
import { COOKIES_URL } from "@/lib/legalUrls";

/** Aviso informativo de cookies (só cookie funcional; sem consentimento granular). */
export default function CookieNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(COOKIE_NOTICE_DISMISSED_KEY) !== "1") setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(COOKIE_NOTICE_DISMISSED_KEY, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  };

  return (
    <div
      role="region"
      aria-label="Aviso de cookies"
      className="fixed inset-x-0 bottom-0 z-[110] border-t border-nubank-border bg-white/95 px-4 py-3 pb-[calc(0.75rem+var(--gm-safe-bottom))] backdrop-blur dark:bg-nubank-bg/95"
    >
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 sm:flex-row sm:justify-between">
        <p className="text-xs leading-relaxed text-nubank-text-secondary">
          Usamos apenas cookies essenciais pro funcionamento do app (login e sessão). Saiba mais na{" "}
          <a
            href={COOKIES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-nubank-primary underline-offset-4 hover:underline"
          >
            Política de Cookies
          </a>
          .
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-[12px] bg-nubank-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:opacity-95"
        >
          Entendi
        </button>
      </div>
    </div>
  );
}
