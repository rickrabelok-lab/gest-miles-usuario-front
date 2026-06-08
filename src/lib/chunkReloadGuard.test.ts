import { describe, it, expect, beforeEach } from "vitest";
import { isChunkLoadError, shouldAutoReload } from "./chunkReloadGuard";

describe("isChunkLoadError", () => {
  it("reconhece mensagens de chunk velho", () => {
    expect(isChunkLoadError("Failed to fetch dynamically imported module: https://x/assets/Page-abc.js")).toBe(true);
    expect(isChunkLoadError("error loading dynamically imported module")).toBe(true);
    expect(isChunkLoadError("Importing a module script failed.")).toBe(true);
    expect(isChunkLoadError("Loading chunk vendor-123 failed")).toBe(true);
    expect(isChunkLoadError("Unable to preload CSS for /assets/x.css")).toBe(true);
  });
  it("ignora erros não relacionados", () => {
    expect(isChunkLoadError("TypeError: x is not a function")).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
    expect(isChunkLoadError("")).toBe(false);
  });
});

describe("shouldAutoReload (anti-loop)", () => {
  beforeEach(() => {
    try { sessionStorage.clear(); } catch { /* noop */ }
  });
  it("autoriza a 1ª vez e bloqueia dentro do cooldown, liberando depois", () => {
    const t0 = 1_000_000;
    expect(shouldAutoReload(t0)).toBe(true); // 1ª vez → recarrega
    expect(shouldAutoReload(t0 + 5_000)).toBe(false); // dentro do cooldown → NÃO recarrega (anti-loop)
    expect(shouldAutoReload(t0 + 20_000)).toBe(true); // passou o cooldown → ok de novo
  });
});
