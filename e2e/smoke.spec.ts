import { test, expect, type Page } from "@playwright/test";

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const haveCreds = Boolean(EMAIL && PASSWORD);

async function login(page: Page) {
  await page.goto("/auth");
  await page.locator("#auth-email").waitFor({ state: "visible", timeout: 30_000 });
  await page.locator("#auth-email").fill(EMAIL!);
  await page.locator("#auth-password").fill(PASSWORD!);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  // Login bem-sucedido sai de qualquer tela /auth.
  await expect(page).not.toHaveURL(/\/auth/, { timeout: 30_000 });
}

/** Fecha diálogos de pesquisa (NPS/CSAT) que abrem na home p/ cliente_gestão, se aparecerem.
 *  Podem vir empilhados; Escape fecha o de cima. Cliques têm timeout curto p/ não travar. */
async function dismissSurveys(page: Page) {
  await page.waitForTimeout(1500); // deixa os diálogos (assíncronos) renderizarem
  const dialogs = page.locator('[role="dialog"]');
  for (let i = 0; i < 6; i++) {
    if ((await dialogs.count()) === 0) break;
    await page.keyboard.press("Escape").catch(() => {});
    await dialogs.last().getByRole("button", { name: "Depois" }).click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(400);
  }
}

test.describe("smoke do app do cliente", () => {
  test("rota protegida sem sessão redireciona pro login", async ({ page }) => {
    await page.goto("/perfil");
    await expect(page.locator("#auth-email")).toBeVisible({ timeout: 30_000 });
    expect(new URL(page.url()).pathname).toContain("/auth");
  });

  test("login leva ao app autenticado", async ({ page }) => {
    test.skip(!haveCreds, "Defina E2E_EMAIL e E2E_PASSWORD para rodar.");
    await login(page);
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Menu do usuário" })).toBeVisible({ timeout: 30_000 });
  });

  test("abre tela-chave (perfil) e faz logout", async ({ page }) => {
    test.skip(!haveCreds, "Defina E2E_EMAIL e E2E_PASSWORD para rodar.");
    await login(page);
    // Tela-chave: o formulário de perfil carrega.
    await page.goto("/perfil");
    await expect(page.getByRole("heading", { name: "Perfil do cliente" })).toBeVisible({ timeout: 30_000 });
    // Logout: só existe no header (home). Dispensa as pesquisas que bloqueiam o menu.
    await page.goto("/");
    await dismissSurveys(page);
    await page.getByRole("button", { name: "Menu do usuário" }).click();
    await page.getByRole("menuitem", { name: "Sair" }).click();
    await expect(page.locator("#auth-email")).toBeVisible({ timeout: 30_000 });
  });
});
