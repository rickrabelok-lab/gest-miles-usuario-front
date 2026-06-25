# Export de dados LGPD ("Baixar meus dados") — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o usuário (`cliente`/`cliente_gestao`) baixe um arquivo JSON com todos os seus dados pessoais legíveis pelo navegador, materializando os direitos de acesso e portabilidade da LGPD (art. 18).

**Architecture:** Front-only. Um service (`dataExportService.ts`) consulta cada tabela do próprio usuário via Supabase client (RLS já escopa a ele), com try/catch por fonte, monta um objeto e dispara o download via Blob. Um item "Baixar meus dados" na seção Legal do menu (`DashboardHeader`) chama o service. Zero backend, zero migration, zero dependência nova.

**Tech Stack:** React 18 + TS (frouxo) + Vite + Supabase JS + sonner (toast) + lucide-react (ícone) + Vitest (testes).

## Global Constraints

- **Copy em PT-BR.** Banco `snake_case`, TS `camelCase`.
- **Type-check REAL = `npx tsc -b`** (build não type-checka). **Rede de segurança = `npm test` (Vitest).**
- **Zero Trust:** só ler dados do PRÓPRIO usuário via RLS; **NUNCA** consultar `cliente_programa_acessos` (segredo, não-legível pelo browser); tratar erro/401/403 graciosamente (cai em `observacoes`, nunca derruba o export).
- **Sem dependência nova** (JSON via `Blob` nativo; ícone `Download` já existe no lucide-react).
- **NÃO replicar no fork do manager** (é ação self-service do cliente final).
- Branch já criada: `feat/lgpd-export-meus-dados`. Commits frequentes.
- Owner-columns confirmadas via MCP read-only (ver tabela no spec): `perfis`/`preferencias_usuario` → `usuario_id`; `programas_cliente`/`demandas_cliente`/`timeline_eventos`/`nps_avaliacoes`/`csat_avaliacoes`/`alertas_sistema` → `cliente_id`; `mensagens_contato` → `cliente_usuario_id`; indicações via RPC `indicacao_meu_resumo()`.

---

### Task 1: `dataExportService` — montagem do bundle + download

**Files:**
- Create: `src/services/dataExportService.ts`
- Test: `src/services/dataExportService.test.ts`

**Interfaces:**
- Consumes: `supabase` de `@/lib/supabase` (default param, injetável nos testes).
- Produces:
  - `type AccountInfo = { id: string; email: string | null; criadoEm: string | null }`
  - `type DataExportBundle = { exportadoEm: string; aplicacao: string; conta: AccountInfo; perfil: unknown | null; programas: unknown[]; demandas: unknown[]; preferencias: unknown | null; timeline: unknown[]; npsAvaliacoes: unknown[]; csatAvaliacoes: unknown[]; alertas: unknown[]; mensagensContato: unknown[]; indicacoes: unknown | null; observacoes: string[] }`
  - `async function gatherUserData(userId: string, account: AccountInfo, client?: SupabaseLike): Promise<DataExportBundle>`
  - `function downloadJson(bundle: DataExportBundle): void`

- [ ] **Step 1: Write the failing tests**

Create `src/services/dataExportService.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { downloadJson, gatherUserData } from "./dataExportService";

// Mock chainável do Supabase client. Cada tabela tem um resultado em `results`
// (chave = nome da tabela, ou "rpc:<nome>"). Registra chamadas em `calls`.
function makeClient(results: Record<string, { data?: unknown; error?: unknown }>) {
  const calls = { from: [] as string[], select: [] as unknown[][], eq: [] as unknown[][] };
  const builder = (key: string) => {
    const result = () => Promise.resolve(results[key] ?? { data: [], error: null });
    const b: Record<string, unknown> = {
      select: (cols: string) => {
        calls.select.push([key, cols]);
        return b;
      },
      eq: (col: string, val: unknown) => {
        calls.eq.push([key, col, val]);
        return b;
      },
      maybeSingle: () => result(),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        result().then(resolve, reject),
    };
    return b;
  };
  const client = {
    from: (table: string) => {
      calls.from.push(table);
      return builder(table);
    },
    rpc: (name: string) => {
      calls.from.push(`rpc:${name}`);
      return Promise.resolve(results[`rpc:${name}`] ?? { data: null, error: null });
    },
  };
  return { client, calls };
}

const ACCOUNT = { id: "u-1", email: "cliente@x.com", criadoEm: "2026-01-01T00:00:00.000Z" };

describe("gatherUserData", () => {
  beforeEach(() => vi.clearAllMocks());

  it("monta o bundle com todas as chaves, metadados e conta", async () => {
    const { client } = makeClient({});
    const bundle = await gatherUserData("u-1", ACCOUNT, client as never);

    expect(typeof bundle.exportadoEm).toBe("string");
    expect(bundle.aplicacao).toContain("Gest Miles");
    expect(bundle.conta).toEqual(ACCOUNT);
    expect(bundle).toHaveProperty("perfil");
    expect(bundle).toHaveProperty("programas");
    expect(bundle).toHaveProperty("demandas");
    expect(bundle).toHaveProperty("preferencias");
    expect(bundle).toHaveProperty("timeline");
    expect(bundle).toHaveProperty("npsAvaliacoes");
    expect(bundle).toHaveProperty("csatAvaliacoes");
    expect(bundle).toHaveProperty("alertas");
    expect(bundle).toHaveProperty("mensagensContato");
    expect(bundle).toHaveProperty("indicacoes");
  });

  it("sempre inclui a nota fixa sobre credenciais cifradas", async () => {
    const { client } = makeClient({});
    const bundle = await gatherUserData("u-1", ACCOUNT, client as never);
    expect(bundle.observacoes.some((o) => o.toLowerCase().includes("cifrad"))).toBe(true);
  });

  it("consulta cada fonte com a tabela e a coluna de dono corretas", async () => {
    const { client, calls } = makeClient({});
    await gatherUserData("u-1", ACCOUNT, client as never);

    expect(calls.from).toContain("perfis");
    expect(calls.from).toContain("programas_cliente");
    expect(calls.from).toContain("demandas_cliente");
    expect(calls.from).toContain("preferencias_usuario");
    expect(calls.from).toContain("timeline_eventos");
    expect(calls.from).toContain("nps_avaliacoes");
    expect(calls.from).toContain("csat_avaliacoes");
    expect(calls.from).toContain("alertas_sistema");
    expect(calls.from).toContain("mensagens_contato");
    expect(calls.from).toContain("rpc:indicacao_meu_resumo");

    expect(calls.eq).toContainEqual(["perfis", "usuario_id", "u-1"]);
    expect(calls.eq).toContainEqual(["preferencias_usuario", "usuario_id", "u-1"]);
    expect(calls.eq).toContainEqual(["programas_cliente", "cliente_id", "u-1"]);
    expect(calls.eq).toContainEqual(["demandas_cliente", "cliente_id", "u-1"]);
    expect(calls.eq).toContainEqual(["timeline_eventos", "cliente_id", "u-1"]);
    expect(calls.eq).toContainEqual(["nps_avaliacoes", "cliente_id", "u-1"]);
    expect(calls.eq).toContainEqual(["csat_avaliacoes", "cliente_id", "u-1"]);
    expect(calls.eq).toContainEqual(["alertas_sistema", "cliente_id", "u-1"]);
    expect(calls.eq).toContainEqual(["mensagens_contato", "cliente_usuario_id", "u-1"]);
  });

  it("NUNCA consulta a tabela de credenciais cifradas", async () => {
    const { client, calls } = makeClient({});
    await gatherUserData("u-1", ACCOUNT, client as never);
    expect(calls.from).not.toContain("cliente_programa_acessos");
  });

  it("uma fonte que falha vira observação e não derruba o resto", async () => {
    const { client } = makeClient({
      timeline_eventos: { data: null, error: { message: "permission denied" } },
      programas_cliente: { data: [{ id: "p1" }], error: null },
    });
    const bundle = await gatherUserData("u-1", ACCOUNT, client as never);

    expect(bundle.observacoes.some((o) => o.toLowerCase().includes("timeline"))).toBe(true);
    expect(bundle.programas).toEqual([{ id: "p1" }]);
  });

  it("inclui o resumo de indicações vindo da RPC", async () => {
    const { client } = makeClient({
      "rpc:indicacao_meu_resumo": { data: { codigo: "ABC", total_cadastrados: 3 }, error: null },
    });
    const bundle = await gatherUserData("u-1", ACCOUNT, client as never);
    expect(bundle.indicacoes).toEqual({ codigo: "ABC", total_cadastrados: 3 });
  });
});

describe("downloadJson", () => {
  afterEach(() => vi.restoreAllMocks());

  it("nomeia o arquivo com a data do export e dispara o download", () => {
    const createSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const anchor = document.createElement("a");
    const clickSpy = vi.spyOn(anchor, "click").mockImplementation(() => {});
    vi.spyOn(document, "createElement").mockReturnValue(anchor);

    downloadJson({
      exportadoEm: "2026-06-25T10:00:00.000Z",
      aplicacao: "Gest Miles — app do cliente",
      conta: ACCOUNT,
      perfil: null,
      programas: [],
      demandas: [],
      preferencias: null,
      timeline: [],
      npsAvaliacoes: [],
      csatAvaliacoes: [],
      alertas: [],
      mensagensContato: [],
      indicacoes: null,
      observacoes: [],
    });

    expect(anchor.download).toBe("gest-miles-meus-dados-2026-06-25.json");
    expect(clickSpy).toHaveBeenCalled();
    expect(createSpy).toHaveBeenCalled();
    expect(revokeSpy).toHaveBeenCalledWith("blob:fake");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/services/dataExportService.test.ts`
Expected: FAIL (módulo `./dataExportService` não existe / export não encontrado).

- [ ] **Step 3: Implement the service**

Create `src/services/dataExportService.ts`:

```ts
import { supabase } from "@/lib/supabase";

export type AccountInfo = {
  id: string;
  email: string | null;
  criadoEm: string | null;
};

export type DataExportBundle = {
  exportadoEm: string;
  aplicacao: string;
  conta: AccountInfo;
  perfil: unknown | null;
  programas: unknown[];
  demandas: unknown[];
  preferencias: unknown | null;
  timeline: unknown[];
  npsAvaliacoes: unknown[];
  csatAvaliacoes: unknown[];
  alertas: unknown[];
  mensagensContato: unknown[];
  indicacoes: unknown | null;
  observacoes: string[];
};

// Só os métodos que usamos — mantém o service testável com um mock simples.
type SupabaseLike = Pick<typeof supabase, "from" | "rpc">;

const APLICACAO = "Gest Miles — app do cliente";

const CREDENCIAIS_NOTE =
  "Por segurança, logins e senhas de programas de fidelidade ficam cifrados no servidor e não são incluídos neste arquivo. Você os gerencia diretamente no app.";

// Allowlist de colunas pessoais de `perfis` (fora: stripe_*/subscription_*/admin_level
// /organizacao_id/plano_* — controle interno/billing, sem valor de portabilidade).
const PERFIL_COLUMNS =
  "usuario_id, slug, nome_completo, nome, email, data_nascimento, cpf, numero_telefone, endereco, equipe, role, equipe_id, configuracao_tema, created_at";

async function unwrap(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<unknown> {
  const { data, error } = await query;
  if (error) {
    const msg =
      error && typeof error === "object" && "message" in error
        ? String((error as { message: unknown }).message)
        : "erro ao consultar";
    throw new Error(msg);
  }
  return data;
}

type Source = {
  key: keyof DataExportBundle;
  label: string;
  fetch: (client: SupabaseLike, userId: string) => Promise<unknown>;
};

const SOURCES: Source[] = [
  {
    key: "perfil",
    label: "Perfil",
    fetch: (c, uid) =>
      unwrap(c.from("perfis").select(PERFIL_COLUMNS).eq("usuario_id", uid).maybeSingle()),
  },
  {
    key: "programas",
    label: "Programas",
    fetch: (c, uid) => unwrap(c.from("programas_cliente").select("*").eq("cliente_id", uid)),
  },
  {
    key: "demandas",
    label: "Demandas e cotações",
    fetch: (c, uid) => unwrap(c.from("demandas_cliente").select("*").eq("cliente_id", uid)),
  },
  {
    key: "preferencias",
    label: "Preferências",
    fetch: (c, uid) =>
      unwrap(
        c.from("preferencias_usuario").select("preferencias").eq("usuario_id", uid).maybeSingle(),
      ),
  },
  {
    key: "timeline",
    label: "Timeline",
    fetch: (c, uid) => unwrap(c.from("timeline_eventos").select("*").eq("cliente_id", uid)),
  },
  {
    key: "npsAvaliacoes",
    label: "Avaliações NPS",
    fetch: (c, uid) => unwrap(c.from("nps_avaliacoes").select("*").eq("cliente_id", uid)),
  },
  {
    key: "csatAvaliacoes",
    label: "Avaliações CSAT",
    fetch: (c, uid) => unwrap(c.from("csat_avaliacoes").select("*").eq("cliente_id", uid)),
  },
  {
    key: "alertas",
    label: "Alertas",
    fetch: (c, uid) => unwrap(c.from("alertas_sistema").select("*").eq("cliente_id", uid)),
  },
  {
    key: "mensagensContato",
    label: "Mensagens de contato",
    fetch: (c, uid) =>
      unwrap(c.from("mensagens_contato").select("*").eq("cliente_usuario_id", uid)),
  },
  {
    key: "indicacoes",
    label: "Indicações",
    fetch: (c) => unwrap(c.rpc("indicacao_meu_resumo")),
  },
];

export async function gatherUserData(
  userId: string,
  account: AccountInfo,
  client: SupabaseLike = supabase,
): Promise<DataExportBundle> {
  const bundle: DataExportBundle = {
    exportadoEm: new Date().toISOString(),
    aplicacao: APLICACAO,
    conta: account,
    perfil: null,
    programas: [],
    demandas: [],
    preferencias: null,
    timeline: [],
    npsAvaliacoes: [],
    csatAvaliacoes: [],
    alertas: [],
    mensagensContato: [],
    indicacoes: null,
    observacoes: [CREDENCIAIS_NOTE],
  };

  for (const source of SOURCES) {
    try {
      const data = await source.fetch(client, userId);
      (bundle as Record<string, unknown>)[source.key] = data;
    } catch {
      bundle.observacoes.push(`${source.label}: não foi possível ler estes dados agora.`);
    }
  }

  return bundle;
}

export function downloadJson(bundle: DataExportBundle): void {
  const json = JSON.stringify(bundle, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const data = bundle.exportadoEm.slice(0, 10); // AAAA-MM-DD
  const a = document.createElement("a");
  a.href = url;
  a.download = `gest-miles-meus-dados-${data}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/services/dataExportService.test.ts`
Expected: PASS (todos os testes verdes).

- [ ] **Step 5: Type-check**

Run: `npx tsc -b`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/services/dataExportService.ts src/services/dataExportService.test.ts
git commit -m "feat(usuario): service de export de dados LGPD (gatherUserData + downloadJson)"
```

---

### Task 2: Ponto de entrada no menu (`DashboardHeader`)

**Files:**
- Modify: `src/components/DashboardHeader.tsx`

**Interfaces:**
- Consumes: `gatherUserData`, `downloadJson` de `@/services/dataExportService` (Task 1); `user` de `useAuth()`; `toast` de `sonner`; `Download` de `lucide-react`.
- Produces: item "Baixar meus dados" na seção Legal do menu (Sheet).

- [ ] **Step 1: Adicionar o ícone `Download` ao import do lucide-react**

Em `src/components/DashboardHeader.tsx`, no bloco de import do `lucide-react` (linhas 1-22), adicionar `Download` à lista (ex.: logo após `Cookie,`):

```ts
  Cookie,
  Download,
} from "lucide-react";
```

- [ ] **Step 2: Importar o service**

Logo após a linha `import { toast } from "sonner";` (linha 37), adicionar:

```ts
import { gatherUserData, downloadJson } from "@/services/dataExportService";
```

- [ ] **Step 3: Adicionar estado + handler no corpo do componente**

Dentro de `DashboardHeader`, junto aos outros `useState` (após `const [idCopied, setIdCopied] = useState(false);`, linha 60), adicionar:

```ts
  const [isExporting, setIsExporting] = useState(false);
```

E logo após o `handleLogout` (linha ~91), adicionar o handler:

```ts
  const handleExportData = async () => {
    if (!user || isExporting) return;
    setIsExporting(true);
    const toastId = toast.loading("Gerando seu arquivo de dados…");
    try {
      const bundle = await gatherUserData(user.id, {
        id: user.id,
        email: user.email ?? null,
        criadoEm: (user as { created_at?: string }).created_at ?? null,
      });
      downloadJson(bundle);
      toast.success("Pronto! Seu arquivo foi baixado.", { id: toastId });
    } catch {
      toast.error("Não foi possível gerar seu arquivo agora. Tente novamente.", { id: toastId });
    } finally {
      setIsExporting(false);
    }
  };
```

- [ ] **Step 4: Adicionar o item na seção Legal do menu**

Na seção Legal (dentro do `<div className="space-y-0.5">`, logo após o botão de Cookies que termina na linha ~376 com `</SheetClose>`), adicionar:

```tsx
                      <SheetClose asChild>
                        <button
                          type="button"
                          disabled={isExporting}
                          className="flex w-full items-center gap-3 rounded-lg px-1 py-3 text-left text-sm text-gray-800 transition-colors hover:bg-gray-100 disabled:opacity-60 dark:text-gray-900 dark:hover:bg-gray-200/80"
                          onClick={handleExportData}
                        >
                          <Download className="h-5 w-5 shrink-0 text-[#8A05BE]" />
                          <span>{isExporting ? "Gerando…" : "Baixar meus dados"}</span>
                        </button>
                      </SheetClose>
```

- [ ] **Step 5: Type-check + lint + build**

Run: `npx tsc -b && npm run lint && npm run build`
Expected: sem erros.

- [ ] **Step 6: Smoke manual**

Run: `npm run dev:all` (front + backend). Login com a conta de teste cliente (`smoke-usuario@gestmiles.com.br`). Abrir o menu (hambúrguer) → seção **Legal** → **Baixar meus dados**. Confirmar: toast "Gerando…" → arquivo `gest-miles-meus-dados-AAAA-MM-DD.json` baixado → abrir o JSON e conferir que tem `conta`, `perfil`, `programas`, `observacoes` (com a nota de credenciais) e que **não** há login/senha de programa.

- [ ] **Step 7: Commit**

```bash
git add src/components/DashboardHeader.tsx
git commit -m "feat(usuario): item 'Baixar meus dados' (export LGPD) na seção Legal do menu"
```

---

### Verificação final (antes de "pronto"/PR)

- [ ] `npx tsc -b` limpo
- [ ] `npm test` verde (suíte completa, não só o arquivo novo)
- [ ] `npm run build` ok
- [ ] Smoke manual do Task 2/Step 6 confirmado (arquivo baixa, sem segredo)
- [ ] Abrir PR `feat/lgpd-export-meus-dados` → `main` (não push direto)

## Self-review do plano (feito)

- **Spec coverage:** formato JSON (downloadJson) ✅; front-only via RLS ✅; credenciais excluídas + nota (CREDENCIAIS_NOTE) ✅; entrada na seção Legal ✅; robustez por-fonte ✅; testes Vitest (shape, owner-column, falha→observacao, nunca-acessa-segredo, RPC indicações) ✅; não replicar no manager ✅.
- **Placeholders:** nenhum — todo passo tem código/comando concreto.
- **Type consistency:** `gatherUserData`/`downloadJson`/`AccountInfo`/`DataExportBundle` idênticos entre service, testes e DashboardHeader.
