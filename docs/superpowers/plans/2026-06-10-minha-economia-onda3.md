# Minha Economia (Onda 3 do Relatório de Economia) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tela "Minha Economia" no app do cliente (`gest-miles-usuario-front`): hero compacto de KPIs + extrato por mês + relatório baixável em PDF (print), consumindo a RPC `get_relatorio_economia` já em produção.

**Architecture:** Port read-only do visual do manager (repos NÃO compartilham código — mesmo processo do port do ProgramSelectionSheet): lib local com tipos/parse/agrupamento, hook somente-leitura, componente de relatório (hero + extrato + case + consolidado) usado na tela E no print, página com chips de período (3m/6m/12m/tudo) e botão "Baixar relatório" (`window.print()` + CSS visibility). **Zero migration e zero RPC nova** — a RPC já garante: cliente lê só o próprio relatório, eventos internos filtrados server-side, KPIs consistentes.

**Tech Stack:** React 18 + Vite + TS, react-router-dom v6, Tailwind (tokens nubank), Vitest + Testing Library.

**Spec:** `gest-miles-manager-front/docs/superpowers/specs/2026-06-10-relatorio-economia-timeline-design.md` §8 + Adendo (economia automática; promoção sem valoração R$).

**Fatos deste repo que o engenheiro precisa saber:**
- REPO: `C:\Users\rick_\OneDrive\Área de Trabalho\Gest Miles\gest-miles-usuario-front` (todos os paths abaixo são relativos a ele). ⚠️ Pegadinha do harness: paths de Write/Edit resolvem relativo ao CWD do Bash — use paths ABSOLUTOS nas ferramentas de arquivo.
- Rotas: `src/App.tsx`, UM bloco só. Páginas são `lazy(() => import(...))` no topo; rotas de cliente usam wrapper `<ClienteOnly>` (espelhar a rota `/vencimentos`, linhas ~239-246).
- Menu: sheet do `src/components/DashboardHeader.tsx`, seção "Ações rápidas" (botões com `SheetClose asChild` + `navigate(...)`, ~linhas 236-277).
- Supabase client: `@/lib/supabase`. Auth: `useAuth()` de `@/contexts/AuthContext` (dá `user.id`).
- NÃO existe `src/lib/programs.ts` neste repo (sem registry) — o payload de promoção guarda slug ("smiles"); a lib local prettifica ("Smiles", "Latam Pass").
- Gates: `npx tsc -p tsconfig.app.json --noEmit` (0 erros) + `npx vitest run` (rodar da raiz do repo).
- Identidade: roxo `#8A05BE` (este repo usa 8A, não 8B), verde economia `green-600`, tokens/sombras `nubank`, mobile-first.
- A RPC devolve camelCase: `kpis.{economiaEmissoes,economiaTotal,numEmissoes,numCotacoes,funilCotacoes,milhasGeradasPromocoes,milhasCustoZero,custoMilheiroMedio}`, `eventos[]` (origem manual/emissao) e `caseDestaque`.

---

### Task 1: Branch

- [ ] **Step 1:**

```bash
cd "/c/Users/rick_/OneDrive/Área de Trabalho/Gest Miles/gest-miles-usuario-front"
git checkout main && git pull && git checkout -b feat/minha-economia
```

---

### Task 2: Lib local `relatorio-economia.ts` (TDD)

**Files:**
- Create: `src/lib/relatorio-economia.ts`
- Test: `src/lib/relatorio-economia.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/lib/relatorio-economia.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  parseRelatorioEconomia,
  groupEventosByMes,
  custoComGestaoEmissao,
  resumoEvento,
  nomePrograma,
  formatBRL,
  type RelatorioEvento,
  type RelatorioEventoEmissao,
  type RelatorioEventoManual,
} from "@/lib/relatorio-economia";

describe("parseRelatorioEconomia", () => {
  it("normaliza o retorno da RPC com defaults seguros", () => {
    const parsed = parseRelatorioEconomia({
      kpis: { economiaEmissoes: "1266.32", numEmissoes: 2, milhasGeradasPromocoes: 190000 },
      eventos: [{ id: "x", origem: "emissao", tipo: "emissao", dataEvento: "2026-05-18", titulo: "Smiles", milhasUtilizadas: 1000, taxaEmbarque: 50, economia: null }],
    });
    expect(parsed.kpis.economiaEmissoes).toBe(1266.32);
    expect(parsed.kpis.economiaTotal).toBe(1266.32);
    expect(parsed.kpis.milhasGeradasPromocoes).toBe(190000);
    expect(parsed.kpis.custoMilheiroMedio).toBeNull();
    expect(parsed.eventos).toHaveLength(1);
  });

  it("retorno vazio vira relatório zerado", () => {
    const parsed = parseRelatorioEconomia(null);
    expect(parsed.kpis.numEmissoes).toBe(0);
    expect(parsed.eventos).toEqual([]);
    expect(parsed.caseDestaque).toBeNull();
  });
});

describe("groupEventosByMes", () => {
  it("agrupa por mês em ordem decrescente com rótulo PT-BR", () => {
    const eventos = [
      { id: "1", origem: "manual", tipo: "nota", dataEvento: "2026-03-10", titulo: "a", descricao: "", visivelCliente: true, payload: {} },
      { id: "2", origem: "manual", tipo: "nota", dataEvento: "2026-05-02", titulo: "b", descricao: "", visivelCliente: true, payload: {} },
    ] as RelatorioEvento[];
    const grupos = groupEventosByMes(eventos);
    expect(grupos.map((g) => g.chave)).toEqual(["2026-05", "2026-03"]);
    expect(grupos[0].rotulo).toMatch(/maio/i);
  });
});

describe("custoComGestaoEmissao", () => {
  const base: RelatorioEventoEmissao = {
    id: "e1", origem: "emissao", tipo: "emissao", dataEvento: "2026-05-18", titulo: "Tudo Azul",
    rotaOrigem: "VCP", rotaDestino: "MAO", classe: null, milhasUtilizadas: 31680, taxaEmbarque: 46.52,
    emissaoFornecedor: false, tarifaPagante: 1693, custoFornecedor: null, passageiros: null,
    cpmMilheiro: 12, economia: 1266.32,
  };

  it("emissão própria: milhas × CPM + taxas (caso real do banco)", () => {
    expect(custoComGestaoEmissao(base)).toBeCloseTo(426.68, 2);
  });

  it("fornecedor: custo do fornecedor", () => {
    expect(
      custoComGestaoEmissao({ ...base, emissaoFornecedor: true, custoFornecedor: 1290, cpmMilheiro: null }),
    ).toBe(1290);
  });

  it("sem CPM nem fornecedor: incalculável", () => {
    expect(custoComGestaoEmissao({ ...base, cpmMilheiro: null })).toBeNull();
  });
});

describe("resumoEvento", () => {
  it("cotação: rota, classe e valores", () => {
    const ev: RelatorioEventoManual = {
      id: "c1", origem: "manual", tipo: "cotacao", dataEvento: "2026-06-10", titulo: "Cotação",
      descricao: "", visivelCliente: true,
      payload: { origem: "GRU", destino: "MVD", classe: "premium-economy", milhasCotadas: 20000, taxasCotadas: 150, valorPagante: 1500, status: "entregue" },
    };
    const r = resumoEvento(ev);
    expect(r).toContain("GRU → MVD");
    expect(r).toContain("Premium Economy");
    expect(r).toContain("20.000 milhas");
  });

  it("promoção: programas prettificados, pontos+bônus, milhas geradas e custo", () => {
    const ev: RelatorioEventoManual = {
      id: "p1", origem: "manual", tipo: "promocao", dataEvento: "2026-06-10", titulo: "Transferência",
      descricao: "", visivelCliente: true,
      payload: { programaOrigem: "Itaú", programaDestino: "smiles", pontosTransferidos: 100000, bonusPct: 90, milhasGeradas: 190000, custoCliente: 500 },
    };
    const r = resumoEvento(ev);
    expect(r).toContain("Itaú → Smiles");
    expect(r).toContain("100.000 pts +90%");
    expect(r).toContain("190.000 milhas geradas");
    expect(r).toContain("custo");
  });

  it("case destaque: snapshot resumido", () => {
    const ev: RelatorioEventoManual = {
      id: "k1", origem: "manual", tipo: "case_emissao", dataEvento: "2026-05-18", titulo: "Destaque",
      descricao: "", visivelCliente: true,
      payload: { emissaoId: "e1", linhas: [], snapshot: { custoTotalInvestido: 7453.14, custoMilheiroReal: 15.29, pctCustoZero: 65.3 } },
    };
    const r = resumoEvento(ev);
    expect(r).toContain("investido");
    expect(r).toContain("15,29");
    expect(r).toContain("65,3%");
  });
});

describe("nomePrograma", () => {
  it("prettifica slugs e preserva nomes já formatados", () => {
    expect(nomePrograma("smiles")).toBe("Smiles");
    expect(nomePrograma("latam-pass")).toBe("Latam Pass");
    expect(nomePrograma("Itaú")).toBe("Itaú");
  });
});

describe("formatBRL", () => {
  it("formata moeda pt-BR", () => {
    expect(formatBRL(1266.32)).toMatch(/R\$\s?1\.266,32/);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `cd "/c/Users/rick_/OneDrive/Área de Trabalho/Gest Miles/gest-miles-usuario-front" && npx vitest run src/lib/relatorio-economia.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar a lib**

Criar `src/lib/relatorio-economia.ts`:

```typescript
// Port READ-ONLY da lib do manager (repos não compartilham código — mesmo
// processo do port do ProgramSelectionSheet). Fonte dos dados: RPC
// get_relatorio_economia (guard server-side: cliente lê só o próprio relatório,
// eventos internos já vêm filtrados, economia calculada via CPM real).

export type RelatorioEventoTipo = "cotacao" | "promocao" | "oportunidade" | "nota" | "case_emissao";
export type CotacaoStatus = "entregue" | "fechou" | "nao_fechou" | "expirou";

export const TIPO_EVENTO_LABELS: Record<RelatorioEventoTipo | "emissao", string> = {
  emissao: "Emissão",
  cotacao: "Cotação",
  promocao: "Promoção",
  oportunidade: "Oportunidade",
  nota: "Nota",
  case_emissao: "Emissão destaque",
};

export const COTACAO_STATUS_LABELS: Record<CotacaoStatus, string> = {
  entregue: "Entregue",
  fechou: "Fechou ✓",
  nao_fechou: "Não fechou",
  expirou: "Expirou",
};

/** Cópia local dos rótulos de classe (o manager importa de demandaDisplayUtils). */
export const CLASSE_VOO_LABELS: Record<string, string> = {
  economica: "Econômica",
  "premium-economy": "Premium Economy",
  executiva: "Executiva",
  "primeira-classe": "Primeira classe",
};

export type RelatorioEventoManual = {
  id: string;
  origem: "manual";
  tipo: RelatorioEventoTipo;
  /** YYYY-MM-DD */
  dataEvento: string;
  titulo: string;
  descricao: string;
  visivelCliente: boolean;
  payload: Record<string, unknown>;
};

export type RelatorioEventoEmissao = {
  id: string;
  origem: "emissao";
  tipo: "emissao";
  dataEvento: string;
  titulo: string;
  rotaOrigem: string | null;
  rotaDestino: string | null;
  classe: string | null;
  milhasUtilizadas: number;
  taxaEmbarque: number;
  emissaoFornecedor: boolean;
  tarifaPagante: number | null;
  custoFornecedor: number | null;
  passageiros: number | null;
  /** CPM usado no cálculo automático server-side. */
  cpmMilheiro?: number | null;
  /** Economia calculada server-side (tarifa − custo real). */
  economia: number | null;
};

export type RelatorioEvento = RelatorioEventoManual | RelatorioEventoEmissao;

export type FunilCotacoes = {
  entregues: number;
  fechadas: number;
  naoFechadas: number;
  expiradas: number;
};

export type RelatorioKpis = {
  economiaEmissoes: number;
  economiaTotal: number;
  numEmissoes: number;
  numCotacoes: number;
  funilCotacoes: FunilCotacoes;
  milhasGeradasPromocoes: number;
  milhasCustoZero: number;
  custoMilheiroMedio: number | null;
};

export type RelatorioEconomia = {
  kpis: RelatorioKpis;
  eventos: RelatorioEvento[];
  caseDestaque: Record<string, unknown> | null;
};

export const formatBRL = (v: number): string =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const formatMilhasBR = (v: number): string => v.toLocaleString("pt-BR");

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Nome amigável do programa: o payload guarda slug ("smiles", "latam-pass") ou
 * texto livre ("Itaú"). Sem registry neste repo — prettifica o slug localmente.
 */
export function nomePrograma(v: string): string {
  const s = v.trim();
  if (!s) return s;
  if (s !== s.toLowerCase()) return s; // já formatado (tem maiúscula)
  return s
    .split("-")
    .map((parte) => (parte ? parte.charAt(0).toUpperCase() + parte.slice(1) : parte))
    .join(" ");
}

const emptyKpis = (): RelatorioKpis => ({
  economiaEmissoes: 0,
  economiaTotal: 0,
  numEmissoes: 0,
  numCotacoes: 0,
  funilCotacoes: { entregues: 0, fechadas: 0, naoFechadas: 0, expiradas: 0 },
  milhasGeradasPromocoes: 0,
  milhasCustoZero: 0,
  custoMilheiroMedio: null,
});

/** Normaliza o jsonb devolvido por get_relatorio_economia. */
export function parseRelatorioEconomia(raw: unknown): RelatorioEconomia {
  const r = (raw ?? {}) as Record<string, unknown>;
  const k = (r.kpis ?? {}) as Record<string, unknown>;
  const f = (k.funilCotacoes ?? {}) as Record<string, unknown>;
  const economiaEmissoes = num(k.economiaEmissoes) ?? 0;
  const kpis: RelatorioKpis = {
    economiaEmissoes,
    economiaTotal: num(k.economiaTotal) ?? economiaEmissoes,
    numEmissoes: num(k.numEmissoes) ?? 0,
    numCotacoes: num(k.numCotacoes) ?? 0,
    funilCotacoes: {
      entregues: num(f.entregues) ?? 0,
      fechadas: num(f.fechadas) ?? 0,
      naoFechadas: num(f.naoFechadas) ?? 0,
      expiradas: num(f.expiradas) ?? 0,
    },
    milhasGeradasPromocoes: num(k.milhasGeradasPromocoes) ?? 0,
    milhasCustoZero: num(k.milhasCustoZero) ?? 0,
    custoMilheiroMedio: num(k.custoMilheiroMedio),
  };
  const eventos = Array.isArray(r.eventos) ? (r.eventos as RelatorioEvento[]) : [];
  const caseDestaque =
    r.caseDestaque && typeof r.caseDestaque === "object"
      ? (r.caseDestaque as Record<string, unknown>)
      : null;
  return { kpis: { ...emptyKpis(), ...kpis }, eventos, caseDestaque };
}

export function groupEventosByMes(
  eventos: RelatorioEvento[],
): Array<{ chave: string; rotulo: string; eventos: RelatorioEvento[] }> {
  const sorted = [...eventos].sort((a, b) => b.dataEvento.localeCompare(a.dataEvento));
  const grupos: Array<{ chave: string; rotulo: string; eventos: RelatorioEvento[] }> = [];
  for (const ev of sorted) {
    const chave = ev.dataEvento.slice(0, 7);
    const atual = grupos[grupos.length - 1];
    if (atual && atual.chave === chave) {
      atual.eventos.push(ev);
    } else {
      const rotulo = new Date(`${chave}-01T12:00:00`).toLocaleDateString("pt-BR", {
        month: "long",
        year: "numeric",
      });
      grupos.push({ chave, rotulo, eventos: [ev] });
    }
  }
  return grupos;
}

/** Custo real da emissão pro cliente ("custo com gestão" do consolidado). */
export function custoComGestaoEmissao(e: RelatorioEventoEmissao): number | null {
  if (e.emissaoFornecedor) return e.custoFornecedor ?? null;
  const cpm = num(e.cpmMilheiro);
  if (cpm !== null) return (e.milhasUtilizadas / 1000) * cpm + (e.taxaEmbarque || 0);
  return null;
}

/** Linha de detalhes de um evento manual (port do resumoManual do manager). */
export function resumoEvento(ev: RelatorioEventoManual): string | null {
  const p = ev.payload;
  const partes: string[] = [];
  if (ev.tipo === "cotacao") {
    const origem = str(p.origem);
    const destino = str(p.destino);
    if (origem || destino) partes.push(`${origem || "?"} → ${destino || "?"}`);
    const classe = str(p.classe);
    if (classe) partes.push(CLASSE_VOO_LABELS[classe] ?? classe);
    const milhas = num(p.milhasCotadas);
    const taxas = num(p.taxasCotadas);
    if (milhas) partes.push(`${formatMilhasBR(milhas)} milhas${taxas ? ` + ${formatBRL(taxas)}` : ""}`);
    const pagante = num(p.valorPagante);
    if (pagante) partes.push(`pagante ${formatBRL(pagante)}`);
  } else if (ev.tipo === "promocao") {
    const de = str(p.programaOrigem);
    const para = str(p.programaDestino);
    if (de || para) partes.push(`${de ? nomePrograma(de) : "?"} → ${para ? nomePrograma(para) : "?"}`);
    const pontos = num(p.pontosTransferidos);
    const bonus = num(p.bonusPct);
    if (pontos) partes.push(`${formatMilhasBR(pontos)} pts${bonus ? ` +${bonus}%` : ""}`);
    const geradas = num(p.milhasGeradas);
    if (geradas) partes.push(`${formatMilhasBR(geradas)} milhas geradas`);
    const custo = num(p.custoCliente);
    partes.push(custo ? `custo ${formatBRL(custo)}` : "custo zero");
  } else if (ev.tipo === "oportunidade") {
    const origem = str(p.origem);
    const destino = str(p.destino);
    if (origem || destino) partes.push(`${origem || "?"} → ${destino || "?"}`);
    const perdido = num(p.valorEstimadoPerdido);
    if (perdido) partes.push(`valor estimado ${formatBRL(perdido)}`);
  } else if (ev.tipo === "case_emissao") {
    const snap = (p.snapshot ?? null) as
      | { custoTotalInvestido?: number; custoMilheiroReal?: number | null; pctCustoZero?: number | null }
      | null;
    if (snap) {
      const custoTotal = num(snap.custoTotalInvestido);
      if (custoTotal !== null) partes.push(`investido ${formatBRL(custoTotal)}`);
      const cpm = num(snap.custoMilheiroReal);
      if (cpm !== null) partes.push(`milheiro real ${formatBRL(cpm)}`);
      const pct = num(snap.pctCustoZero);
      if (pct !== null) partes.push(`${pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% a custo zero`);
    }
  }
  return partes.length > 0 ? partes.join(" · ") : null;
}
```

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `npx vitest run src/lib/relatorio-economia.test.ts`
Expected: PASS (10 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/relatorio-economia.ts src/lib/relatorio-economia.test.ts
git commit -m "feat(usuario): lib local do relatório de economia (port read-only do manager)"
```

---

### Task 3: Hook `useMinhaEconomia` (TDD)

**Files:**
- Create: `src/hooks/useMinhaEconomia.ts`
- Test: `src/hooks/useMinhaEconomia.test.tsx`

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/hooks/useMinhaEconomia.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@/lib/supabase", () => ({ supabase: { rpc: vi.fn() } }));

import { supabase } from "@/lib/supabase";
import { useMinhaEconomia } from "@/hooks/useMinhaEconomia";

const rpcMock = supabase.rpc as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useMinhaEconomia", () => {
  it("busca o relatório do próprio cliente via get_relatorio_economia", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { kpis: { economiaEmissoes: 1266.32 }, eventos: [], caseDestaque: null },
      error: null,
    });
    const { result } = renderHook(() => useMinhaEconomia());
    await act(async () => {
      await result.current.fetchRelatorio("user-1", "2026-01-01", null);
    });
    expect(rpcMock).toHaveBeenCalledWith("get_relatorio_economia", {
      p_cliente_id: "user-1",
      p_inicio: "2026-01-01",
      p_fim: null,
    });
    expect(result.current.data?.kpis.economiaTotal).toBe(1266.32);
    expect(result.current.error).toBeNull();
  });

  it("erro do RPC vira mensagem amigável", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const { result } = renderHook(() => useMinhaEconomia());
    await act(async () => {
      await result.current.fetchRelatorio("user-1", null, null);
    });
    expect(result.current.error).toMatch(/não foi possível/i);
    expect(result.current.data).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npx vitest run src/hooks/useMinhaEconomia.test.tsx`
Expected: FAIL — hook não existe.

- [ ] **Step 3: Implementar o hook**

Criar `src/hooks/useMinhaEconomia.ts`:

```typescript
// Hook read-only do Minha Economia: o cliente busca o PRÓPRIO relatório.
// O guard real é server-side (auth.uid() = p_cliente_id na RPC).
import { useCallback, useState } from "react";
import { supabase } from "@/lib/supabase";
import { parseRelatorioEconomia, type RelatorioEconomia } from "@/lib/relatorio-economia";

const ERR_LOAD = "Não foi possível carregar sua economia agora. Tente novamente em instantes.";

export function useMinhaEconomia() {
  const [data, setData] = useState<RelatorioEconomia | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRelatorio = useCallback(
    async (clienteId: string, inicio: string | null = null, fim: string | null = null) => {
      setLoading(true);
      setError(null);
      const { data: raw, error: rpcError } = await supabase.rpc("get_relatorio_economia", {
        p_cliente_id: clienteId,
        p_inicio: inicio,
        p_fim: fim,
      });
      if (rpcError) {
        if (import.meta.env.DEV) console.warn("[MinhaEconomia] fetch:", rpcError);
        setError(ERR_LOAD);
        setLoading(false);
        return;
      }
      setData(parseRelatorioEconomia(raw));
      setLoading(false);
    },
    [],
  );

  return { data, loading, error, fetchRelatorio };
}
```

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `npx vitest run src/hooks/useMinhaEconomia.test.tsx`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useMinhaEconomia.ts src/hooks/useMinhaEconomia.test.tsx
git commit -m "feat(usuario): hook useMinhaEconomia — leitura do relatório do próprio cliente"
```

---

### Task 4: Componente `MinhaEconomiaRelatorio` (TDD)

**Files:**
- Create: `src/components/minha-economia/MinhaEconomiaRelatorio.tsx`
- Test: `src/components/minha-economia/MinhaEconomiaRelatorio.test.tsx`

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/components/minha-economia/MinhaEconomiaRelatorio.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { MinhaEconomiaRelatorio } from "@/components/minha-economia/MinhaEconomiaRelatorio";
import type { RelatorioEconomia } from "@/lib/relatorio-economia";

const data: RelatorioEconomia = {
  kpis: {
    economiaEmissoes: 11227.71,
    economiaTotal: 11227.71,
    numEmissoes: 1,
    numCotacoes: 2,
    funilCotacoes: { entregues: 1, fechadas: 1, naoFechadas: 0, expiradas: 0 },
    milhasGeradasPromocoes: 302400,
    milhasCustoZero: 302400,
    custoMilheiroMedio: 15.29,
  },
  eventos: [
    {
      id: "em-1", origem: "emissao", tipo: "emissao", dataEvento: "2026-05-18", titulo: "Smiles",
      rotaOrigem: "GIG", rotaDestino: "MCO", classe: "economica", milhasUtilizadas: 852500,
      taxaEmbarque: 2774.4, emissaoFornecedor: false, tarifaPagante: 18680.85, custoFornecedor: null,
      passageiros: 4, cpmMilheiro: 5.49, economia: 11227.71,
    },
    {
      id: "ev-1", origem: "manual", tipo: "promocao", dataEvento: "2026-04-19", titulo: "Itaú → Smiles 80%",
      descricao: "", visivelCliente: true,
      payload: { programaOrigem: "Itaú", programaDestino: "smiles", pontosTransferidos: 151000, bonusPct: 80, milhasGeradas: 271800 },
    },
    {
      id: "case-1", origem: "manual", tipo: "case_emissao", dataEvento: "2026-05-18",
      titulo: "Emissão destaque · GIG → MCO", descricao: "", visivelCliente: true,
      payload: { emissaoId: "em-1", linhas: [], snapshot: { custoTotalInvestido: 7453.14, custoMilheiroReal: 15.29, pctCustoZero: 65.3, economia: 11227.71 } },
    },
  ],
  caseDestaque: {
    id: "case-1",
    dataEvento: "2026-05-18",
    titulo: "Emissão destaque · GIG → MCO",
    payload: {
      emissaoId: "em-1",
      linhas: [
        { origemTipo: "saldo_original", label: "Saldo original", milhas: 273823, custo: 0 },
        { origemTipo: "compra", label: "Livelo 80%", milhas: 306000, custo: 4678.74 },
      ],
      snapshot: { custoTotalInvestido: 7453.14, custoMilheiroReal: 15.29, pctCustoZero: 65.3, economia: 11227.71 },
    },
  },
};

describe("MinhaEconomiaRelatorio", () => {
  it("hero mostra a economia total e o período", () => {
    render(<MinhaEconomiaRelatorio periodoLabel="últimos 12 meses" data={data} />);
    expect(screen.getAllByText(/11\.227,71/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/últimos 12 meses/i)).toBeInTheDocument();
  });

  it("KPIs: emissões, cotações, milhas geradas e milheiro real", () => {
    render(<MinhaEconomiaRelatorio periodoLabel="tudo" data={data} />);
    expect(screen.getAllByText(/302\.400/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/15,29/).length).toBeGreaterThanOrEqual(1);
  });

  it("extrato agrupado por mês com emissão (economia verde) e promoção", () => {
    render(<MinhaEconomiaRelatorio periodoLabel="tudo" data={data} />);
    expect(screen.getByText(/maio de 2026/i)).toBeInTheDocument();
    expect(screen.getByText(/abril de 2026/i)).toBeInTheDocument();
    expect(screen.getByText(/GIG → MCO · Smiles/)).toBeInTheDocument();
    expect(screen.getByText(/271\.800 milhas geradas/)).toBeInTheDocument();
  });

  it("seção do case destaque com composição e stats", () => {
    render(<MinhaEconomiaRelatorio periodoLabel="tudo" data={data} />);
    expect(screen.getAllByText(/emissão destaque/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/7\.453,14/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/65,3%/).length).toBeGreaterThanOrEqual(1);
  });

  it("resumo consolidado com custo com gestão (852,5 × 5,49 + 2.774,40)", () => {
    render(<MinhaEconomiaRelatorio periodoLabel="tudo" data={data} />);
    expect(screen.getByText(/resumo consolidado/i)).toBeInTheDocument();
    expect(screen.getByText(/7\.454,6[23]/)).toBeInTheDocument();
  });

  it("sem eventos mostra estado vazio amigável", () => {
    render(
      <MinhaEconomiaRelatorio periodoLabel="tudo"
        data={{ kpis: { ...data.kpis, numEmissoes: 0, economiaTotal: 0, economiaEmissoes: 0 }, eventos: [], caseDestaque: null }} />,
    );
    expect(screen.getByText(/nenhum evento/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npx vitest run src/components/minha-economia/MinhaEconomiaRelatorio.test.tsx`
Expected: FAIL — componente não existe.

- [ ] **Step 3: Implementar o componente**

Criar `src/components/minha-economia/MinhaEconomiaRelatorio.tsx`:

```tsx
// Relatório "Minha Economia" (port mobile do RelatorioPremium do manager):
// hero compacto Clean Stripe + extrato por mês + case destaque + consolidado.
// Visual puro — recebe o retorno parseado da RPC. Usado na tela E no print.
import { cn } from "@/lib/utils";
import {
  COTACAO_STATUS_LABELS,
  TIPO_EVENTO_LABELS,
  custoComGestaoEmissao,
  formatBRL,
  formatMilhasBR,
  groupEventosByMes,
  resumoEvento,
  type CotacaoStatus,
  type RelatorioEconomia,
  type RelatorioEventoEmissao,
  type RelatorioEventoManual,
} from "@/lib/relatorio-economia";

interface MinhaEconomiaRelatorioProps {
  periodoLabel: string;
  data: RelatorioEconomia;
}

const fmtData = (ymd: string) => {
  const d = new Date(`${ymd}T12:00:00`);
  return Number.isNaN(d.getTime())
    ? ymd
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
};

const CHIP: Record<string, string> = {
  emissao: "bg-purple-50 text-[#8A05BE]",
  cotacao: "bg-sky-50 text-sky-700",
  promocao: "bg-green-50 text-green-700",
  oportunidade: "bg-amber-50 text-amber-700",
  nota: "bg-slate-100 text-slate-600",
  case_emissao: "bg-purple-50 text-[#8A05BE]",
};

export function MinhaEconomiaRelatorio({ periodoLabel, data }: MinhaEconomiaRelatorioProps) {
  const { kpis, eventos, caseDestaque } = data;
  // A RPC já filtra eventos internos pro cliente (guard server-side) — sem refiltro aqui.
  const emissoes = eventos.filter((e): e is RelatorioEventoEmissao => e.origem === "emissao");
  const grupos = groupEventosByMes(eventos.filter((e) => e.origem === "emissao" || e.tipo !== "case_emissao"));

  const casePayload = (caseDestaque?.payload ?? null) as
    | { linhas?: Array<Record<string, unknown>>; snapshot?: Record<string, unknown> }
    | null;
  const snapshot = (casePayload?.snapshot ?? null) as
    | { custoTotalInvestido?: number; custoMilheiroReal?: number | null; pctCustoZero?: number | null; economia?: number | null }
    | null;

  const subtotal = emissoes.reduce((s, e) => s + (e.economia ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* Hero compacto Clean Stripe */}
      <header className="relatorio-bloco overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-nubank">
        <div className="h-[4px] bg-[#8A05BE]" aria-hidden />
        <div className="px-4 py-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8A05BE]">
            Minha economia · {periodoLabel}
          </p>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-2">
            <p className="text-3xl font-extrabold leading-none text-green-600">
              {formatBRL(kpis.economiaTotal)}
            </p>
            <p className="text-xs text-gray-500">economizados com a gestão</p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-[#f0e9f7] px-3 py-2">
              <p className="text-sm font-extrabold leading-tight">{kpis.numEmissoes}</p>
              <p className="text-[10px] text-gray-500">emissões</p>
            </div>
            <div className="rounded-xl border border-[#f0e9f7] px-3 py-2">
              <p className="text-sm font-extrabold leading-tight">{kpis.numCotacoes}</p>
              <p className="text-[10px] text-gray-500">cotações entregues</p>
            </div>
            <div className="rounded-xl border border-[#f0e9f7] px-3 py-2">
              <p className="text-sm font-extrabold leading-tight text-[#8A05BE]">
                {formatMilhasBR(kpis.milhasGeradasPromocoes)}
              </p>
              <p className="text-[10px] text-gray-500">
                milhas geradas{kpis.milhasCustoZero > 0 ? ` (${formatMilhasBR(kpis.milhasCustoZero)} a custo zero)` : ""}
              </p>
            </div>
            <div className="rounded-xl border border-[#f0e9f7] px-3 py-2">
              <p className="text-sm font-extrabold leading-tight">
                {kpis.custoMilheiroMedio !== null ? formatBRL(kpis.custoMilheiroMedio) : "—"}
              </p>
              <p className="text-[10px] text-gray-500">milheiro real</p>
            </div>
          </div>
        </div>
      </header>

      {/* Extrato por mês */}
      <section className="space-y-3">
        {grupos.length === 0 && (
          <p className="rounded-2xl bg-white px-4 py-8 text-center text-xs text-gray-500 shadow-nubank">
            Nenhum evento no período ainda. Sua equipe de gestão registra cotações, promoções e
            emissões aqui — e a economia aparece automaticamente.
          </p>
        )}
        {grupos.map((grupo) => (
          <div key={grupo.chave} className="relatorio-bloco">
            <div className="mb-1.5 flex items-center gap-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#8A05BE]">{grupo.rotulo}</p>
              <div className="h-px flex-1 bg-gradient-to-r from-[#8A05BE]/25 to-transparent" aria-hidden />
            </div>
            <ul className="space-y-1.5">
              {grupo.eventos.map((ev) => {
                const tipoKey = ev.origem === "emissao" ? "emissao" : ev.tipo;
                const emissao = ev.origem === "emissao" ? (ev as RelatorioEventoEmissao) : null;
                const manual = ev.origem === "manual" ? (ev as RelatorioEventoManual) : null;
                const status = manual?.tipo === "cotacao" ? ((manual.payload.status as CotacaoStatus) ?? "entregue") : null;
                return (
                  <li key={`${ev.origem}-${ev.id}`} className="rounded-2xl border border-gray-100 bg-white px-3.5 py-3 shadow-nubank">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide", CHIP[tipoKey] ?? "bg-slate-100")}>
                            {TIPO_EVENTO_LABELS[tipoKey as keyof typeof TIPO_EVENTO_LABELS]}
                          </span>
                          {status && (
                            <span className={cn(
                              "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase",
                              status === "fechou" && "bg-green-100 text-green-700",
                              status === "nao_fechou" && "bg-red-50 text-red-600",
                              status === "entregue" && "bg-sky-100 text-sky-700",
                              status === "expirou" && "bg-slate-100 text-slate-500",
                            )}>
                              {COTACAO_STATUS_LABELS[status]}
                            </span>
                          )}
                          <span className="text-[10px] text-gray-400">{fmtData(ev.dataEvento)}</span>
                        </div>
                        <p className="mt-0.5 text-[13px] font-semibold leading-tight text-gray-900">
                          {emissao ? `${emissao.rotaOrigem ?? "?"} → ${emissao.rotaDestino ?? "?"} · ${emissao.titulo}` : ev.titulo}
                        </p>
                        {emissao && (
                          <p className="text-[11px] text-gray-600">
                            {emissao.emissaoFornecedor
                              ? `via fornecedor${emissao.custoFornecedor ? ` · custo ${formatBRL(emissao.custoFornecedor)}` : ""}`
                              : `${formatMilhasBR(emissao.milhasUtilizadas)} milhas${emissao.taxaEmbarque ? ` + ${formatBRL(emissao.taxaEmbarque)} taxas` : ""}`}
                          </p>
                        )}
                        {manual && resumoEvento(manual) && (
                          <p className="text-[11px] text-gray-600">{resumoEvento(manual)}</p>
                        )}
                        {manual?.descricao && (
                          <p className="mt-0.5 text-[11px] text-gray-500">{manual.descricao}</p>
                        )}
                      </div>
                      {emissao?.economia != null && (
                        <div className="shrink-0 text-right">
                          <p className="text-[8.5px] font-bold uppercase tracking-widest text-green-700/70">Economia</p>
                          <p className="text-[13px] font-extrabold text-green-600">+{formatBRL(emissao.economia)}</p>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      {/* Case destaque */}
      {caseDestaque && casePayload?.linhas && casePayload.linhas.length > 0 && (
        <section className="relatorio-bloco overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-nubank">
          <div className="h-[4px] bg-gradient-to-r from-[#8A05BE] to-[#5d03a0]" aria-hidden />
          <div className="space-y-2.5 px-4 py-3.5">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8A05BE]">
              Emissão destaque — como suas milhas foram construídas
            </h2>
            <p className="text-[13px] font-semibold text-gray-900">{String(caseDestaque.titulo ?? "")}</p>
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-gray-100 text-left text-[9px] uppercase tracking-wide text-gray-400">
                  <th className="py-1.5 pr-2 font-bold">Origem das milhas</th>
                  <th className="py-1.5 pr-2 text-right font-bold">Milhas</th>
                  <th className="py-1.5 text-right font-bold">Custo</th>
                </tr>
              </thead>
              <tbody>
                {casePayload.linhas.map((l, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="py-1.5 pr-2">{String(l.label ?? l.origemTipo ?? "")}</td>
                    <td className="py-1.5 pr-2 text-right">{formatMilhasBR(Number(l.milhas) || 0)}</td>
                    <td className="py-1.5 text-right">
                      {Number(l.custo) > 0 ? formatBRL(Number(l.custo)) : <span className="font-semibold text-green-600">custo zero</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {snapshot && (
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-[#f5eeff] px-3 py-2">
                  <p className="text-[13px] font-extrabold">{formatBRL(Number(snapshot.custoTotalInvestido) || 0)}</p>
                  <p className="text-[9px] text-gray-500">custo total investido</p>
                </div>
                <div className="rounded-xl bg-[#f5eeff] px-3 py-2">
                  <p className="text-[13px] font-extrabold">
                    {snapshot.custoMilheiroReal != null ? formatBRL(Number(snapshot.custoMilheiroReal)) : "—"}
                  </p>
                  <p className="text-[9px] text-gray-500">milheiro real</p>
                </div>
                <div className="rounded-xl bg-[#f5eeff] px-3 py-2">
                  <p className="text-[13px] font-extrabold">
                    {snapshot.pctCustoZero != null ? `${Number(snapshot.pctCustoZero).toLocaleString("pt-BR")}%` : "—"}
                  </p>
                  <p className="text-[9px] text-gray-500">das milhas a custo zero</p>
                </div>
                <div className="rounded-xl bg-green-50 px-3 py-2">
                  <p className="text-[13px] font-extrabold text-green-600">
                    {snapshot.economia != null ? `+${formatBRL(Number(snapshot.economia))}` : "—"}
                  </p>
                  <p className="text-[9px] text-gray-500">economia nesta emissão</p>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Resumo consolidado */}
      {emissoes.length > 0 && (
        <section className="relatorio-bloco rounded-2xl border border-gray-100 bg-white px-4 py-3.5 shadow-nubank">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8A05BE]">Resumo consolidado</h2>
          <table className="mt-2 w-full text-[11px]">
            <thead>
              <tr className="border-b border-gray-100 text-left text-[9px] uppercase tracking-wide text-gray-400">
                <th className="py-1.5 pr-2 font-bold">Data</th>
                <th className="py-1.5 pr-2 font-bold">Operação</th>
                <th className="py-1.5 pr-2 text-right font-bold">Custo</th>
                <th className="py-1.5 text-right font-bold">Economia</th>
              </tr>
            </thead>
            <tbody>
              {emissoes.map((e) => {
                const custo = custoComGestaoEmissao(e);
                return (
                  <tr key={e.id} className="border-b border-gray-50">
                    <td className="py-1.5 pr-2 whitespace-nowrap">{fmtData(e.dataEvento)}</td>
                    <td className="py-1.5 pr-2">
                      {e.rotaOrigem ?? "?"} → {e.rotaDestino ?? "?"}
                      {e.emissaoFornecedor ? " (fornecedor)" : ""}
                    </td>
                    <td className="py-1.5 pr-2 text-right">{custo != null ? formatBRL(custo) : "—"}</td>
                    <td className="py-1.5 text-right font-semibold text-green-600">
                      {e.economia != null ? `+${formatBRL(e.economia)}` : "—"}
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td colSpan={3} className="py-2 pr-2 text-right text-[10px] font-bold uppercase tracking-wide text-gray-400">
                  Total
                </td>
                <td className="py-2 text-right text-[13px] font-extrabold text-green-600">+{formatBRL(subtotal)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      {/* Metodologia */}
      <footer className="relatorio-bloco rounded-2xl bg-white/70 px-4 py-3 text-[10px] leading-relaxed text-gray-500 print:bg-white">
        Os valores de economia são calculados automaticamente pela sua equipe de gestão: preço de
        mercado da passagem no dia de cada emissão, menos o seu custo real — milhas valoradas pelo
        custo médio do milheiro da sua conta no momento da emissão (ou custo do fornecedor), mais
        taxas de embarque.
      </footer>
    </div>
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passam**

Run: `npx vitest run src/components/minha-economia/MinhaEconomiaRelatorio.test.tsx`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add src/components/minha-economia/
git commit -m "feat(usuario): MinhaEconomiaRelatorio — hero compacto + extrato + case + consolidado"
```

---

### Task 5: Página, CSS print, rota e menu

**Files:**
- Create: `src/styles/relatorio-print.css`
- Create: `src/pages/MinhaEconomiaPage.tsx`
- Modify: `src/App.tsx` (lazy import + rota `<ClienteOnly>` após `/vencimentos`)
- Modify: `src/components/DashboardHeader.tsx` (item de menu em "Ações rápidas")
- Test: `src/pages/MinhaEconomiaPage.test.tsx`

- [ ] **Step 1: Criar o CSS print**

Criar `src/styles/relatorio-print.css`:

```css
/* PDF do Minha Economia: na impressão, só o relatório fica visível
   (técnica de visibility — ignora header/nav/toasts do app). */
@media print {
  @page {
    size: A4;
    margin: 12mm;
  }

  body * {
    visibility: hidden;
  }

  #minha-economia-print,
  #minha-economia-print * {
    visibility: visible;
  }

  #minha-economia-print {
    position: absolute;
    inset: 0 auto auto 0;
    width: 100%;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .relatorio-bloco {
    break-inside: avoid;
  }

  .print-hidden {
    display: none !important;
  }
}
```

- [ ] **Step 2: Escrever o teste da página (falha primeiro)**

Criar `src/pages/MinhaEconomiaPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" }, loading: false }),
}));

import MinhaEconomiaPage from "@/pages/MinhaEconomiaPage";
import type { RelatorioEconomia } from "@/lib/relatorio-economia";

beforeEach(() => {
  vi.clearAllMocks();
});

const relatorio: RelatorioEconomia = {
  kpis: {
    economiaEmissoes: 1266.32, economiaTotal: 1266.32, numEmissoes: 1, numCotacoes: 0,
    funilCotacoes: { entregues: 0, fechadas: 0, naoFechadas: 0, expiradas: 0 },
    milhasGeradasPromocoes: 0, milhasCustoZero: 0, custoMilheiroMedio: null,
  },
  eventos: [],
  caseDestaque: null,
};

function makeHook(fetchRelatorio = vi.fn()) {
  return () => ({ data: relatorio, loading: false, error: null, fetchRelatorio });
}

describe("MinhaEconomiaPage", () => {
  it("busca o relatório do usuário logado ao montar (período padrão 12m)", async () => {
    const fetchRelatorio = vi.fn();
    render(
      <MemoryRouter>
        <MinhaEconomiaPage useHook={makeHook(fetchRelatorio)} />
      </MemoryRouter>,
    );
    await waitFor(() => expect(fetchRelatorio).toHaveBeenCalled());
    const [clienteId, inicio, fim] = fetchRelatorio.mock.calls[0];
    expect(clienteId).toBe("user-1");
    expect(inicio).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(fim).toBeNull();
  });

  it("chip Tudo refaz o fetch sem período", async () => {
    const fetchRelatorio = vi.fn();
    render(
      <MemoryRouter>
        <MinhaEconomiaPage useHook={makeHook(fetchRelatorio)} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: /^tudo$/i }));
    await waitFor(() =>
      expect(fetchRelatorio).toHaveBeenLastCalledWith("user-1", null, null),
    );
  });

  it("Baixar relatório chama window.print", () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    render(
      <MemoryRouter>
        <MinhaEconomiaPage useHook={makeHook()} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: /baixar relatório/i }));
    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });

  it("mostra a economia total do relatório", () => {
    render(
      <MemoryRouter>
        <MinhaEconomiaPage useHook={makeHook()} />
      </MemoryRouter>,
    );
    expect(screen.getAllByText(/1\.266,32/).length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falham**

Run: `npx vitest run src/pages/MinhaEconomiaPage.test.tsx`
Expected: FAIL — página não existe.

- [ ] **Step 4: Implementar a página**

Criar `src/pages/MinhaEconomiaPage.tsx`:

```tsx
// Minha Economia: o cliente de gestão acompanha a própria timeline de economia
// e baixa o relatório (print → PDF). Dados da RPC get_relatorio_economia
// (guard server-side: cliente lê só o próprio, internos filtrados).
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, FileDown } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { useMinhaEconomia } from "@/hooks/useMinhaEconomia";
import { MinhaEconomiaRelatorio } from "@/components/minha-economia/MinhaEconomiaRelatorio";
import { cn } from "@/lib/utils";
import "@/styles/relatorio-print.css";

type Periodo = "3m" | "6m" | "12m" | "all";

const PERIODOS: Array<{ id: Periodo; label: string }> = [
  { id: "3m", label: "3 meses" },
  { id: "6m", label: "6 meses" },
  { id: "12m", label: "12 meses" },
  { id: "all", label: "Tudo" },
];

const PERIODO_LABEL: Record<Periodo, string> = {
  "3m": "últimos 3 meses",
  "6m": "últimos 6 meses",
  "12m": "últimos 12 meses",
  all: "período completo",
};

const inicioDoPeriodo = (p: Periodo): string | null => {
  if (p === "all") return null;
  const meses = { "3m": 3, "6m": 6, "12m": 12 }[p];
  const d = new Date();
  d.setMonth(d.getMonth() - meses);
  return d.toISOString().slice(0, 10);
};

interface MinhaEconomiaPageProps {
  /** Hook injetável p/ testes (padrão do repo). */
  useHook?: typeof useMinhaEconomia;
}

export default function MinhaEconomiaPage({ useHook = useMinhaEconomia }: MinhaEconomiaPageProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, loading, error, fetchRelatorio } = useHook();
  const [periodo, setPeriodo] = useState<Periodo>("12m");

  useEffect(() => {
    if (!user?.id) return;
    void fetchRelatorio(user.id, inicioDoPeriodo(periodo), null);
  }, [user?.id, periodo, fetchRelatorio]);

  return (
    <div className="min-h-screen bg-[#f6f3fa] pb-10">
      {/* Header — some na impressão */}
      <div className="print-hidden sticky top-0 z-40 border-b border-gray-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between gap-2 px-4 py-3">
          <button
            type="button"
            className="flex items-center gap-1.5 text-sm font-medium text-gray-700"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Minha Economia
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-full bg-[#8A05BE] px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#7a04a8]"
            onClick={() => window.print()}
          >
            <FileDown className="h-3.5 w-3.5" aria-hidden /> Baixar relatório
          </button>
        </div>
        {/* Chips de período */}
        <div className="mx-auto flex max-w-md gap-1.5 overflow-x-auto px-4 pb-3">
          {PERIODOS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={cn(
                "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
                periodo === p.id
                  ? "bg-[#8A05BE] text-white"
                  : "bg-white text-gray-600 shadow-nubank hover:bg-gray-50",
              )}
              onClick={() => setPeriodo(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-md px-4 pt-4">
        {loading && (
          <p className="py-16 text-center text-sm text-gray-500" aria-live="polite">
            Calculando sua economia…
          </p>
        )}
        {!loading && error && (
          <p className="py-16 text-center text-sm text-red-600" role="alert">{error}</p>
        )}
        {!loading && !error && data && (
          <div id="minha-economia-print">
            <MinhaEconomiaRelatorio periodoLabel={PERIODO_LABEL[periodo]} data={data} />
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Registrar a rota no `App.tsx`**

(a) Lazy import junto aos outros (topo do arquivo):

```tsx
const MinhaEconomiaPage = lazy(() => import("./pages/MinhaEconomiaPage"));
```

(b) Rota logo APÓS a rota `/vencimentos` (~linha 239-246), espelhando o wrapper:

```tsx
                <Route
                  path="/minha-economia"
                  element={
                    <ClienteOnly>
                      <MinhaEconomiaPage />
                    </ClienteOnly>
                  }
                />
```

- [ ] **Step 6: Item de menu no `DashboardHeader.tsx`**

(a) Adicionar `TrendingUp` ao import existente de `lucide-react`.

(b) Na seção "Ações rápidas", logo APÓS o botão "Radar de Oportunidades" (`</SheetClose>` da linha ~276), adicionar:

```tsx
                      <SheetClose asChild>
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 rounded-lg px-1 py-3 text-left text-sm text-gray-800 transition-colors hover:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200/80"
                          onClick={() => navigate("/minha-economia")}
                        >
                          <TrendingUp className="h-5 w-5 shrink-0 text-[#8A05BE]" />
                          <span>Minha Economia</span>
                        </button>
                      </SheetClose>
```

- [ ] **Step 7: Rodar testes da página e gates completos**

Run: `npx vitest run src/pages/MinhaEconomiaPage.test.tsx`
Expected: PASS (4 testes).

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: 0 erros.

Run: `npx vitest run`
Expected: suíte completa verde (reportar contagem).

- [ ] **Step 8: Commit**

```bash
git add src/pages/MinhaEconomiaPage.tsx src/pages/MinhaEconomiaPage.test.tsx src/styles/relatorio-print.css src/App.tsx src/components/DashboardHeader.tsx
git commit -m "feat(usuario): tela Minha Economia — rota, menu, chips de período e download em PDF"
```

---

### Task 6: Smoke manual + PR

> Sem migration, sem mudança no manager. Tudo read-only contra a RPC já em produção.

- [ ] **Step 1: Smoke manual (owner)**

Rodar o app do usuário (script dev deste repo), logar com um CLIENTE DE GESTÃO real:
1. Menu (sheet do header) → "Minha Economia" → tela abre com hero verde + extrato (mesmos eventos que o gestor registrou no manager; eventos marcados como internos NÃO aparecem).
2. Chips 3m/6m/12m/Tudo refazem a busca.
3. "Baixar relatório" → diálogo de impressão mostra SÓ o relatório, A4, cores ok.
4. Logar com um usuário B2C comum → tela mostra as próprias emissões (se houver) ou o estado vazio amigável — sem erro.

- [ ] **Step 2: Push + PR**

```bash
git push -u origin feat/minha-economia
gh pr create --title "feat(usuario): Minha Economia — timeline de economia do cliente + PDF (Onda 3)" --body "$(cat <<'EOF'
## O quê
Onda 3 (final) do Relatório de Economia (spec no repo do manager, §8):
- Tela **Minha Economia** (\`/minha-economia\`, menu Ações rápidas): hero compacto Clean Stripe com KPIs, extrato por mês, case destaque e resumo consolidado
- Chips de período (3m/6m/12m/tudo) refazem a busca na RPC
- **Baixar relatório**: window.print() + CSS @media print (só o relatório imprime, A4)
- Port read-only do manager (repos não compartilham código); consome \`get_relatorio_economia\` já em produção — guard server-side garante cliente lê só o próprio relatório com eventos internos filtrados
- Sem migration, sem backend novo

## Testes
- 22 novos (lib port, hook, componente, página) — suíte completa verde
- tsc -p tsconfig.app.json --noEmit limpo

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Verificação final**

Invocar `superpowers:verification-before-completion` antes de declarar pronto.

---

## Self-review (feito na escrita do plano)

- **Cobertura da spec §8:** hero compacto + seletor de período ✓ (Task 5) · extrato agrupado por mês ✓ (Task 4) · botão baixar via print ✓ (Tasks 4-5) · mesma RPC com guard self ✓ (Task 3) · read-only (cliente não cria eventos) ✓ (nenhuma mutation no hook) · port sem code-sharing ✓.
- **Placeholders:** nenhum; todo step com código/comando completo.
- **Consistência de tipos:** `RelatorioEconomia`/`RelatorioEvento*` definidos na Task 2 e usados nas 3/4/5; `useHook` prop da página = `typeof useMinhaEconomia`; ids print (`#minha-economia-print`) batem entre página e CSS; cor `#8A05BE` (deste repo) em todos os componentes.
- **Decisões registradas:** sem `RequirePaid` (é transparência do serviço de gestão, read-only — segue o gating do `/vencimentos`, que é só `ClienteOnly`); sem registry de programas (prettificação local de slug); KPI/funil de cotações não exibe funil detalhado no cliente (YAGNI — KPI simples "cotações entregues").
