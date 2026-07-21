import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Shell mobile (edge-to-edge): o meta viewport e as variáveis de safe-area são
// pré-requisitos do passthrough do Capacitor 8 — regressão aqui volta a faixa
// clara da status bar no app Android.
const indexHtml = readFileSync(path.resolve(process.cwd(), "index.html"), "utf-8");
const indexCss = readFileSync(path.resolve(process.cwd(), "src", "index.css"), "utf-8");

describe("shell mobile — edge-to-edge", () => {
  it("meta viewport declara viewport-fit=cover (gatilho do passthrough)", () => {
    expect(indexHtml).toContain("viewport-fit=cover");
  });

  it("index.css define a cadeia --gm-safe-* (var do Capacitor → env → 0px)", () => {
    expect(indexCss).toContain(
      "--gm-safe-top: var(--safe-area-inset-top, env(safe-area-inset-top, 0px));",
    );
    expect(indexCss).toContain(
      "--gm-safe-bottom: var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px));",
    );
    expect(indexCss).toContain(
      "--gm-safe-left: var(--safe-area-inset-left, env(safe-area-inset-left, 0px));",
    );
    expect(indexCss).toContain(
      "--gm-safe-right: var(--safe-area-inset-right, env(safe-area-inset-right, 0px));",
    );
  });
});
