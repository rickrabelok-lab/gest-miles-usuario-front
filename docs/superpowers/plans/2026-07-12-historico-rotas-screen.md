# Tela "Histórico de rotas" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tela dedicada `/bonus-offers/rotas` que lista o histórico de bônus por rota de transferência (browse da fase 4), alimentada por um RPC definer novo.

**Architecture:** RPC `promo_historico_rotas()` (SECURITY DEFINER, só agregados) agrupa `promo_alerts` pelos slugs materializados → lib `getPromoHistoricoRotas` + `formatUltima` → hook `usePromoHistoricoRotas` → `HistoricoRotasScreen` (lista de cards) → rota em `App.tsx` + link no hub `BonusOffersScreen`.

**Tech Stack:** React 18 + Vite + TS frouxo + Tailwind (design nubank) + TanStack Query + Supabase JS + Vitest.

## Global Constraints

- **Migration em banco COMPARTILHADO (sem staging):** o SQL da Task 1 **NÃO é auto-aplicado**; o controller aplica via MCP **com OK do owner**. O arquivo só versiona.
- **Zero-Trust:** a tela é só UX; a proteção é a RLS + o RPC definer devolver **só agregados** (sem PII). Não trazer objeto de `promo_alerts` inteiro pro browser.
- **Escopo v1: só `category='transfer'`**; ordem por `ultima` desc (decisões do owner).
- **Type-check REAL = `npx tsc -b`** (o build não type-checka). **Rede de segurança = `npm test`** (Vitest). Rodar ambos + `npm run build` antes de "pronto".
- **Pages = `export default` + lazy import** em `App.tsx` (`const X = lazy(() => import("./pages/X"))`).
- Classes de design existentes: `shadow-nubank`, `section-label`, `text-nubank-text`, `text-nubank-text-secondary`, `bg-nubank-bg`, `rounded-[20px]`, `text-nubank-dark`, `bg-nubank-tint`.

---

## Arquivos

- **Criar:** `supabase/migrations/20260712180000_promo_historico_rotas.sql` — RPC de lista.
- **Modificar:** `src/lib/promo-alerts/historico.ts` — `HistoricoRotaLista`, `getPromoHistoricoRotas`, `formatUltima`.
- **Modificar:** `src/lib/promo-alerts/historico.test.ts` — testes das novas funções.
- **Criar:** `src/hooks/usePromoHistoricoRotas.ts` — hook.
- **Criar:** `src/pages/HistoricoRotasScreen.tsx` — a tela.
- **Modificar:** `src/App.tsx` — lazy import + rota `/bonus-offers/rotas`.
- **Modificar:** `src/pages/BonusOffersScreen.tsx` — link de entrada no hub.

---

## Task 1: Migration do RPC `promo_historico_rotas()`

**Files:**
- Create: `supabase/migrations/20260712180000_promo_historico_rotas.sql`

**Interfaces:**
- Produces: RPC `promo_historico_rotas()` retornando linhas `{ source_id, target_id, source_nome, target_nome, vezes, bonus_medio, bonus_max, bonus_min, primeira, ultima }`, ordenadas por `ultima` desc. Consumido pela Task 2.

- [ ] **Step 1: Escrever a migration**

Create `supabase/migrations/20260712180000_promo_historico_rotas.sql`:

```sql
-- Fase 4 (browse): lista o histórico de bônus por rota de transferência.
-- SECURITY DEFINER (a RLS de promo_alerts esconde as expiradas, que SÃO o histórico);
-- devolve só agregados (público). Agrupa pelos slugs materializados (source/target_program_id).
-- NÃO aplicar aqui: rollout com OK do owner (banco compartilhado).
-- Rollback: drop function public.promo_historico_rotas();
create or replace function public.promo_historico_rotas()
returns table (
  source_id text, target_id text, source_nome text, target_nome text,
  vezes int, bonus_medio numeric, bonus_max numeric, bonus_min numeric,
  primeira date, ultima date
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    source_program_id, target_program_id,
    (array_agg(source_program order by created_at desc) filter (where source_program is not null))[1],
    (array_agg(target_program order by created_at desc) filter (where target_program is not null))[1],
    count(*)::int,
    round(avg(bonus_numeric), 0), max(bonus_numeric), min(bonus_numeric),
    min(coalesce(valid_from, created_at::date)), max(coalesce(valid_from, created_at::date))
  from public.promo_alerts
  where category = 'transfer'
    and status in ('approved', 'expired')
    and bonus_numeric is not null
    and source_program_id is not null
    and target_program_id is not null
  group by source_program_id, target_program_id
  order by max(coalesce(valid_from, created_at::date)) desc;
$$;

revoke all on function public.promo_historico_rotas() from public;
grant execute on function public.promo_historico_rotas() to anon, authenticated;
```

- [ ] **Step 2: Sanidade do SQL (sem aplicar)**

Não há lint de SQL no repo. Conferir a olho: `security definer` + `set search_path` presentes; filtro idêntico ao `promo_historico_rota` (transfer / approved+expired / bonus_numeric not null) + `source/target_program_id is not null`; `group by` pelos 2 slugs; `order by max(...) desc`; grant `anon, authenticated`.

> A APLICAÇÃO no banco é passo de rollout (controller + OK do owner), não deste arquivo.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260712180000_promo_historico_rotas.sql
git commit -m "feat(usuario): migration RPC promo_historico_rotas (browse do histórico de rotas)"
```

---

## Task 2: Lib `getPromoHistoricoRotas` + `formatUltima` (TDD)

**Files:**
- Modify: `src/lib/promo-alerts/historico.ts`
- Test: `src/lib/promo-alerts/historico.test.ts`

**Interfaces:**
- Consumes: RPC `promo_historico_rotas()` (Task 1) via `supabase.rpc`.
- Produces:
  - `interface HistoricoRotaLista { sourceId: string; targetId: string; sourceNome: string; targetNome: string; vezes: number; bonusMedio: number | null; bonusMax: number | null; bonusMin: number | null; primeira: string | null; ultima: string | null }`
  - `getPromoHistoricoRotas(): Promise<HistoricoRotaLista[]>`
  - `formatUltima(iso: string | null): string`

- [ ] **Step 1: Escrever os testes que falham**

Em `src/lib/promo-alerts/historico.test.ts`, adicionar no topo (após os imports existentes) o mock do supabase e novos `describe`s. O arquivo já importa de `./historico`; ajustar o import e adicionar o mock ANTES dos imports do módulo testado:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: { rpc: vi.fn() }, isSupabaseConfigured: true }))

import { resumoHistorico, getPromoHistoricoRotas, formatUltima, type HistoricoRota } from './historico'
import { supabase } from '@/lib/supabase'

const rpcMock = supabase.rpc as ReturnType<typeof vi.fn>
```

Adicionar (mantendo o `describe('resumoHistorico', ...)` existente):

```ts
describe('formatUltima', () => {
  it('YYYY-MM-DD → mes/ano abreviado pt-BR', () => {
    expect(formatUltima('2026-07-01')).toBe('jul/26')
    expect(formatUltima('2026-01-15')).toBe('jan/26')
    expect(formatUltima('2025-12-31')).toBe('dez/25')
  })
  it('null ou inválido → —', () => {
    expect(formatUltima(null)).toBe('—')
    expect(formatUltima('xx')).toBe('—')
  })
})

describe('getPromoHistoricoRotas', () => {
  beforeEach(() => vi.clearAllMocks())

  it('mapeia as linhas do RPC para o shape tipado', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        { source_id: 'livelo', target_id: 'smiles', source_nome: 'Livelo', target_nome: 'Smiles',
          vezes: 5, bonus_medio: 85, bonus_max: 100, bonus_min: 60, primeira: '2026-01-01', ultima: '2026-07-01' },
      ],
      error: null,
    })
    const rotas = await getPromoHistoricoRotas()
    expect(rotas).toHaveLength(1)
    expect(rotas[0]).toMatchObject({ sourceId: 'livelo', targetNome: 'Smiles', vezes: 5, bonusMedio: 85, ultima: '2026-07-01' })
    expect(rpcMock).toHaveBeenCalledWith('promo_historico_rotas')
  })

  it('lança em erro do RPC', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    await expect(getPromoHistoricoRotas()).rejects.toBeTruthy()
  })

  it('data não-array → []', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null })
    expect(await getPromoHistoricoRotas()).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/lib/promo-alerts/historico.test.ts`
Expected: FALHA (`getPromoHistoricoRotas`/`formatUltima` não existem / não exportados).

- [ ] **Step 3: Implementar na `historico.ts`**

Em `src/lib/promo-alerts/historico.ts`, adicionar `isSupabaseConfigured` já está importado (linha 2: `import { supabase, isSupabaseConfigured } from '@/lib/supabase'`). Adicionar ao final do arquivo:

```ts
export interface HistoricoRotaLista {
  sourceId: string
  targetId: string
  sourceNome: string
  targetNome: string
  vezes: number
  bonusMedio: number | null
  bonusMax: number | null
  bonusMin: number | null
  primeira: string | null
  ultima: string | null
}

export async function getPromoHistoricoRotas(): Promise<HistoricoRotaLista[]> {
  if (!isSupabaseConfigured) return []
  const { data, error } = await supabase.rpc('promo_historico_rotas')
  if (error) throw error
  if (!Array.isArray(data)) return []
  return data.map((row: any) => ({
    sourceId: String(row.source_id ?? ''),
    targetId: String(row.target_id ?? ''),
    sourceNome: typeof row.source_nome === 'string' && row.source_nome ? row.source_nome : String(row.source_id ?? ''),
    targetNome: typeof row.target_nome === 'string' && row.target_nome ? row.target_nome : String(row.target_id ?? ''),
    vezes: num(row.vezes) ?? 0,
    bonusMedio: num(row.bonus_medio),
    bonusMax: num(row.bonus_max),
    bonusMin: num(row.bonus_min),
    primeira: typeof row.primeira === 'string' ? row.primeira : null,
    ultima: typeof row.ultima === 'string' ? row.ultima : null,
  }))
}

const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export function formatUltima(iso: string | null): string {
  if (!iso || typeof iso !== 'string') return '—'
  const m = iso.match(/^(\d{4})-(\d{2})-\d{2}/)
  if (!m) return '—'
  const mesIdx = Number(m[2]) - 1
  if (mesIdx < 0 || mesIdx > 11) return '—'
  return `${MESES_ABREV[mesIdx]}/${m[1].slice(2)}`
}
```

(`num` já existe no arquivo — reusar, não redeclarar.)

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/lib/promo-alerts/historico.test.ts`
Expected: PASSA (todos os describes, incl. os antigos de `resumoHistorico`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/promo-alerts/historico.ts src/lib/promo-alerts/historico.test.ts
git commit -m "feat(usuario): getPromoHistoricoRotas + formatUltima (lib do browse de rotas)"
```

---

## Task 3: Hook + tela + rota + link no hub

**Files:**
- Create: `src/hooks/usePromoHistoricoRotas.ts`
- Create: `src/pages/HistoricoRotasScreen.tsx`
- Modify: `src/App.tsx`
- Modify: `src/pages/BonusOffersScreen.tsx`

**Interfaces:**
- Consumes: `getPromoHistoricoRotas`, `formatUltima`, `HistoricoRotaLista` (Task 2).
- Produces: rota `/bonus-offers/rotas` navegável a partir do hub.

- [ ] **Step 1: Criar o hook**

Create `src/hooks/usePromoHistoricoRotas.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { getPromoHistoricoRotas } from '@/lib/promo-alerts/historico'

export function usePromoHistoricoRotas() {
  return useQuery({
    queryKey: ['promo-historico-rotas'],
    queryFn: () => getPromoHistoricoRotas(),
  })
}
```

- [ ] **Step 2: Criar a tela**

Create `src/pages/HistoricoRotasScreen.tsx`:

```tsx
import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { usePromoHistoricoRotas } from '@/hooks/usePromoHistoricoRotas'
import { formatUltima, type HistoricoRotaLista } from '@/lib/promo-alerts/historico'

function statsLinha(r: HistoricoRotaLista): string {
  const parts = [`${r.vezes}×`]
  if (r.bonusMedio != null) parts.push(`média ${r.bonusMedio}%`)
  if (r.bonusMax != null) parts.push(`máx ${r.bonusMax}%`)
  return parts.join(' · ')
}

export default function HistoricoRotasScreen() {
  const navigate = useNavigate()
  const { data, isPending, error } = usePromoHistoricoRotas()
  const rotas = data ?? []

  return (
    <div className="mx-auto min-h-screen max-w-md bg-nubank-bg">
      <div className="flex items-center gap-2.5 px-5 pb-1 pt-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Voltar"
          className="flex h-11 w-11 items-center justify-center rounded-[16px] border border-nubank-border bg-white text-nubank-text transition-colors hover:bg-nubank-bg"
        >
          <ArrowLeft size={19} strokeWidth={2} />
        </button>
        <h1 className="font-display text-xl font-bold tracking-tight text-nubank-text">
          Histórico de rotas
        </h1>
      </div>

      <div className="px-5 pt-3 pb-24">
        {isPending && (
          <p className="py-10 text-center text-sm text-nubank-text-secondary">Carregando…</p>
        )}
        {!isPending && error && (
          <p className="py-10 text-center text-sm text-nubank-text-secondary">
            Não foi possível carregar o histórico agora.
          </p>
        )}
        {!isPending && !error && rotas.length === 0 && (
          <p className="py-10 text-center text-sm text-nubank-text-secondary">
            Ainda estamos acumulando o histórico das rotas — volte em breve.
          </p>
        )}
        <div className="space-y-3">
          {rotas.map((r) => (
            <div key={`${r.sourceId}>${r.targetId}`} className="rounded-[20px] bg-white p-4 shadow-nubank">
              <p className="font-display text-[15px] font-bold text-nubank-text">
                {r.sourceNome} → {r.targetNome}
              </p>
              <p className="mt-1 text-[13px] text-nubank-text-secondary">{statsLinha(r)}</p>
              <p className="mt-1 text-[11.5px] text-nubank-text-secondary">última {formatUltima(r.ultima)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Adicionar a rota no `App.tsx`**

Em `src/App.tsx`, adicionar o lazy import junto dos outros (após a linha `const BonusOfferDetailScreen = lazy(() => import("./pages/BonusOfferDetailScreen"));`):

```tsx
const HistoricoRotasScreen = lazy(() => import("./pages/HistoricoRotasScreen"));
```

E adicionar a rota IMEDIATAMENTE ANTES da rota `path="/bonus-offers/:id"` (segmento estático vence o dinâmico, mas a ordem deixa claro):

```tsx
                <Route
                  path="/bonus-offers/rotas"
                  element={
                    <ClienteOnly>
                      <HistoricoRotasScreen />
                    </ClienteOnly>
                  }
                />
```

- [ ] **Step 4: Adicionar o link no hub `BonusOffersScreen.tsx`**

Em `src/pages/BonusOffersScreen.tsx`, dentro do `{/* Content */}` (`<div className="px-5 pt-2 pb-24">`), logo APÓS o bloco do notice (o `<div className="mb-4 rounded-[16px] bg-warning-soft ...">…</div>`), adicionar:

```tsx
        <button
          type="button"
          onClick={() => navigate('/bonus-offers/rotas')}
          className="mb-4 flex w-full items-center justify-between rounded-[16px] bg-white px-4 py-3 text-left shadow-nubank"
        >
          <span className="text-[13px] font-semibold text-nubank-text">Histórico de rotas</span>
          <span className="text-[12px] font-semibold text-nubank-dark">Ver todas →</span>
        </button>
```

(`navigate` já vem de `useNavigate()` no componente.)

- [ ] **Step 5: Gates (type-check + testes + build)**

Run: `npx tsc -b`
Expected: sem erro.

Run: `npm test`
Expected: toda a suíte passa (incl. `historico.test.ts`).

Run: `npm run build`
Expected: build ok.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/usePromoHistoricoRotas.ts src/pages/HistoricoRotasScreen.tsx src/App.tsx src/pages/BonusOffersScreen.tsx
git commit -m "feat(usuario): tela Histórico de rotas + rota + link no hub de bônus"
```

---

## Rollout (controller, pós-tasks)

1. **Aplicar a migration** via MCP `apply_migration` **com OK do owner** (banco compartilhado). Verificar: `select * from promo_historico_rotas()` devolve as ~3 rotas com agregados coerentes; `get_advisors` sem ERROR novo.
2. **Smoke visual:** rodar o app (conta [[conta-teste-cliente-smoke]]), `/bonus-offers` → link "Histórico de rotas" → `/bonus-offers/rotas`; conferir a lista real. (Sem dado o suficiente? confirmar o empty state.)
3. **PR** + atualizar memória. Confirmar [[sync-user-app-changes-to-manager]] (hub de bônus forkado no manager?).

## Self-Review (feito ao escrever)

- **Cobertura do spec:** RPC (T1), lib+testes (T2), hook+tela+rota+link (T3), aplicação+smoke (rollout). Tudo do spec tem task.
- **Placeholders:** nenhum — SQL, testes e componentes completos inline.
- **Consistência de tipos:** `HistoricoRotaLista` (T2) é o shape que `getPromoHistoricoRotas` devolve e que a tela (T3) consome (`sourceNome/targetNome/vezes/bonusMedio/bonusMax/ultima`); `formatUltima(string|null)` usado na tela; `num` reusado (não redeclarado); RPC devolve os campos que a lib mapeia.
