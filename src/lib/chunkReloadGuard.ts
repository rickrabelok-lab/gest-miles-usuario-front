/**
 * Guard de "chunk velho após deploy".
 *
 * SPA aberta antes de um deploy referencia arquivos JS (hash no nome) que o build novo
 * substituiu. Ao navegar, o import dinâmico do chunk antigo dá 404 → tela branca.
 * Este guard detecta esse erro e recarrega a página UMA vez (busca o index.html novo →
 * chunks novos), com cooldown anti-loop.
 */

const RELOAD_FLAG = "gm:chunk-reloaded-at";
const COOLDOWN_MS = 12_000;

/** Mensagens típicas de falha ao carregar um chunk JS (deploy trocou os arquivos). */
export function isChunkLoadError(message: string | null | undefined): boolean {
  if (!message) return false;
  return /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|chunkloaderror|loading chunk [\w-]+ failed|unable to preload css/i.test(
    message,
  );
}

/**
 * Autoriza recarregar só se NÃO recarregamos nos últimos COOLDOWN_MS (anti-loop).
 * Marca o timestamp quando autoriza. `now` é injetável para teste.
 */
export function shouldAutoReload(now: number = Date.now()): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_FLAG) || "0");
    if (Number.isFinite(last) && now - last < COOLDOWN_MS) return false;
    sessionStorage.setItem(RELOAD_FLAG, String(now));
    return true;
  } catch {
    return true; // sem sessionStorage (modo restrito) → recarrega mesmo assim
  }
}

function reloadOnce(): void {
  if (shouldAutoReload()) window.location.reload();
}

/** Instala os listeners. Idempotência fica por conta do cooldown de `shouldAutoReload`. */
export function installChunkReloadGuard(): void {
  if (typeof window === "undefined") return;

  // Vite: preload de um chunk falhou (cenário clássico de deploy trocando os arquivos).
  window.addEventListener(
    "vite:preloadError" as keyof WindowEventMap,
    ((event: Event) => {
      event.preventDefault();
      reloadOnce();
    }) as EventListener,
  );

  // Fallback: erro global de carregamento de chunk.
  window.addEventListener("error", (event) => {
    if (isChunkLoadError(event?.message)) reloadOnce();
  });

  // Fallback: import() dinâmico que rejeita sem ser capturado.
  window.addEventListener("unhandledrejection", (event) => {
    const reason = (event as PromiseRejectionEvent)?.reason;
    const msg = typeof reason === "string" ? reason : reason?.message;
    if (isChunkLoadError(msg)) reloadOnce();
  });
}
