# Histórico de bônus por rota (Fase 4) — Implementation Plan

> **For agentic workers:** Tasks 2-3 são frontend testável (Vitest, TDD). Task 1 é a migration (escrita; aplicada no rollout com OK do owner). Steps em checkbox.

**Goal:** Mostrar, no detalhe de cada promo de transferência, o histórico do bônus daquela rota (quantas vezes, média/máx, "atual acima da média = bom momento"), a partir do acúmulo de `promo_alerts`.

**Architecture:** RPC `SECURITY DEFINER` agrega approved+expired por rota (vê expiradas que a RLS esconderia) e devolve só agregados; front consome via service + hook + bloco no detalhe. Lógica de resumo/sinal numa função pura testável.

**Tech Stack:** Postgres (RPC), React + TS, TanStack Query, Vitest.

## Global Constraints

- **Base:** `promo_alerts` `category='transfer'`, `status in ('approved','expired')`, `bonus_numeric not null`. Rota = `promo_norm(source)` × `promo_norm(target)` (reusa `promo_norm` da 3-B, já em prod).
- **Exposição:** RPC `SECURITY DEFINER` devolvendo só agregados (não-sensível); `grant execute` a `anon, authenticated`. NÃO expor linhas cruas.
- **Degrada gracioso:** `vezes<=1` → "primeira aparição" (o caso de hoje). Sinal "bom momento" só com `vezes>1` e `bonusAtual>bonusMedio`.
- **UI:** bloco só em `category==='transfer'` com `sourceProgram`+`targetProgram`.
- **Migration:** escrita, **NÃO aplicada** na task; rollout com OK do owner (banco compartilhado).
- **Números pt-BR** na UI; nos testes asserir valores concretos.
- **Gates:** `npx tsc -b` + `npm test` + `npm run build`.
- **Não commitar** `CLAUDE.md`/`.claude/settings.local.json`/`backend/.gitignore`.

---

### Task 1: Migration — RPC `promo_historico_rota`

**Files:** Create `supabase/migrations/20260712160000_promo_historico_rota.sql`

- [ ] **Step 1: Escrever a migration** (não aplicar)

```sql
-- Fase 4: histórico de bônus por rota. RPC SECURITY DEFINER agrega approved+expired
-- (a RLS de promo_alerts esconde expiradas do cliente); devolve só agregados (público).
-- NÃO aplicar aqui: rollout com OK do owner (banco compartilhado).
-- Rollback: drop function public.promo_historico_rota(text, text);
create or replace function public.promo_historico_rota(p_source text, p_target text)
returns table (
  vezes int, bonus_medio numeric, bonus_max numeric, bonus_min numeric,
  primeira date, ultima date
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::int,
         round(avg(bonus_numeric), 0),
         max(bonus_numeric), min(bonus_numeric),
         min(coalesce(valid_from, created_at::date)),
         max(coalesce(valid_from, created_at::date))
  from public.promo_alerts
  where category = 'transfer'
    and status in ('approved', 'expired')
    and bonus_numeric is not null
    and promo_norm(source_program) = promo_norm(p_source)
    and promo_norm(target_program) = promo_norm(p_target);
$$;

revoke all on function public.promo_historico_rota(text, text) from public;
grant execute on function public.promo_historico_rota(text, text) to anon, authenticated;
```

- [ ] **Step 2: Self-check** — `security definer` + `set search_path`; agrega só agregados; reusa `promo_norm` (já em prod); grant a anon/authenticated. **Não aplicar.**
- [ ] **Step 3: Commit** — `git add supabase/migrations/20260712160000_promo_historico_rota.sql && git commit -m "feat(usuario): RPC promo_historico_rota (histórico de bônus por rota — aplicar no rollout)"`

---

### Task 2: lib `historico` (service + `resumoHistorico` puro)

**Files:** Create `src/lib/promo-alerts/historico.ts` + `src/lib/promo-alerts/historico.test.ts`

**Interfaces (Produces):**
- `interface HistoricoRota { vezes: number; bonusMedio: number|null; bonusMax: number|null; bonusMin: number|null; primeira: string|null; ultima: string|null }`
- `getPromoHistoricoRota(source: string, target: string, opts?: {signal?: AbortSignal}): Promise<HistoricoRota | null>`
- `interface ResumoHistorico { novo: boolean; texto: string; sinal: 'acima'|'abaixo'|'na_media'|null; vezes: number; bonusMedio: number|null; bonusMax: number|null }`
- `resumoHistorico(h: HistoricoRota | null, bonusAtual: number | null): ResumoHistorico`

- [ ] **Step 1: Write the failing test**

`src/lib/promo-alerts/historico.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { resumoHistorico, type HistoricoRota } from './historico'

const hist = (over: Partial<HistoricoRota> = {}): HistoricoRota => ({
  vezes: 3, bonusMedio: 80, bonusMax: 120, bonusMin: 50, primeira: '2026-01-01', ultima: '2026-07-01', ...over,
})

describe('resumoHistorico', () => {
  it('sem histórico (null ou vezes<=1) → novo', () => {
    expect(resumoHistorico(null, 100).novo).toBe(true)
    expect(resumoHistorico(hist({ vezes: 1 }), 100).novo).toBe(true)
  })

  it('atual acima da média → sinal acima', () => {
    const r = resumoHistorico(hist({ vezes: 3, bonusMedio: 80 }), 100)
    expect(r.novo).toBe(false)
    expect(r.sinal).toBe('acima')
    expect(r.texto).toContain('3×')
  })

  it('atual abaixo da média → sinal abaixo', () => {
    expect(resumoHistorico(hist({ bonusMedio: 80 }), 60).sinal).toBe('abaixo')
  })

  it('sem bonusAtual → na_media (sem sinal de bom momento)', () => {
    expect(resumoHistorico(hist(), null).sinal).toBe('na_media')
  })
})
```

- [ ] **Step 2: Run RED** — `npx vitest run src/lib/promo-alerts/historico.test.ts` → FAIL (módulo inexistente).

- [ ] **Step 3: Implement**

`src/lib/promo-alerts/historico.ts`:

```ts
// src/lib/promo-alerts/historico.ts — histórico de bônus por rota (RPC definer).
import { supabase, isSupabaseConfigured } from '@/lib/supabase'

export interface HistoricoRota {
  vezes: number
  bonusMedio: number | null
  bonusMax: number | null
  bonusMin: number | null
  primeira: string | null
  ultima: string | null
}

export interface ResumoHistorico {
  novo: boolean
  texto: string
  sinal: 'acima' | 'abaixo' | 'na_media' | null
  vezes: number
  bonusMedio: number | null
  bonusMax: number | null
}

function num(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export async function getPromoHistoricoRota(
  source: string,
  target: string,
  opts: { signal?: AbortSignal } = {},
): Promise<HistoricoRota | null> {
  if (!isSupabaseConfigured) return null
  const { data, error } = await supabase
    .rpc('promo_historico_rota', { p_source: source, p_target: target })
    .abortSignal(opts.signal as AbortSignal)
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return null
  return {
    vezes: num(row.vezes) ?? 0,
    bonusMedio: num(row.bonus_medio),
    bonusMax: num(row.bonus_max),
    bonusMin: num(row.bonus_min),
    primeira: typeof row.primeira === 'string' ? row.primeira : null,
    ultima: typeof row.ultima === 'string' ? row.ultima : null,
  }
}

export function resumoHistorico(h: HistoricoRota | null, bonusAtual: number | null): ResumoHistorico {
  const vezes = h?.vezes ?? 0
  const bonusMedio = h?.bonusMedio ?? null
  const bonusMax = h?.bonusMax ?? null
  if (!h || vezes <= 1) {
    return {
      novo: true,
      texto: 'Primeira vez que registramos essa rota — vamos acompanhar o histórico daqui pra frente.',
      sinal: null,
      vezes,
      bonusMedio,
      bonusMax,
    }
  }
  let sinal: 'acima' | 'abaixo' | 'na_media' = 'na_media'
  if (bonusAtual != null && bonusMedio != null) {
    if (bonusAtual > bonusMedio) sinal = 'acima'
    else if (bonusAtual < bonusMedio) sinal = 'abaixo'
  }
  const parts = [`Essa rota já teve bônus ${vezes}×`]
  if (bonusMedio != null) parts.push(`média ${bonusMedio}%`)
  if (bonusMax != null) parts.push(`máx ${bonusMax}%`)
  return { novo: false, texto: parts.join(' · '), sinal, vezes, bonusMedio, bonusMax }
}
```

- [ ] **Step 4: Run GREEN** — `npx vitest run src/lib/promo-alerts/historico.test.ts` → PASS (4 testes).
- [ ] **Step 5: Commit** — `git add src/lib/promo-alerts/historico.ts src/lib/promo-alerts/historico.test.ts && git commit -m "feat(usuario): service + resumoHistorico do histórico de bônus por rota"`

---

### Task 3: hook `usePromoHistoricoRota` + bloco no detalhe

**Files:**
- Create `src/hooks/usePromoHistoricoRota.ts`
- Create `src/components/bonus/RotaHistoricoBlock.tsx`
- Modify `src/pages/BonusOfferDetailScreen.tsx` (render do bloco na aba Promoção)

**Interfaces (Consumes):** `getPromoHistoricoRota`, `resumoHistorico` (Task 2); `BonusPromotion` (`sourceProgram`, `targetProgram`, `bonusNumeric`).

- [ ] **Step 1: Hook**

`src/hooks/usePromoHistoricoRota.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { getPromoHistoricoRota } from '@/lib/promo-alerts/historico'

export function usePromoHistoricoRota(source: string | undefined, target: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['promo-historico', source, target],
    enabled: enabled && !!source && !!target,
    queryFn: ({ signal }) => getPromoHistoricoRota(source as string, target as string, { signal }),
  })
}
```

- [ ] **Step 2: Componente**

`src/components/bonus/RotaHistoricoBlock.tsx`:

```tsx
// src/components/bonus/RotaHistoricoBlock.tsx — histórico da rota no detalhe da transferência.
import { usePromoHistoricoRota } from '@/hooks/usePromoHistoricoRota'
import { resumoHistorico } from '@/lib/promo-alerts/historico'

interface Props {
  source: string
  target: string
  bonusAtual: number | null
}

export function RotaHistoricoBlock({ source, target, bonusAtual }: Props) {
  const { data, isPending } = usePromoHistoricoRota(source, target, true)
  if (isPending) return null
  const resumo = resumoHistorico(data ?? null, bonusAtual)
  return (
    <div className="rounded-[20px] bg-white p-4 shadow-nubank">
      <p className="section-label mb-1.5">Histórico da rota</p>
      <p className="text-[13px] leading-snug text-nubank-text">{resumo.texto}</p>
      {resumo.sinal === 'acima' && (
        <span className="mt-2.5 inline-block rounded-full bg-nubank-tint px-2.5 py-1 text-[11px] font-bold text-nubank-dark">
          🔥 Acima da média — bom momento
        </span>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Fiar no detalhe**

Em `src/pages/BonusOfferDetailScreen.tsx`: import `import { RotaHistoricoBlock } from '@/components/bonus/RotaHistoricoBlock'`. Na aba `promotion`, **logo após o card hero** (o `</div>` que fecha `rounded-[24px] ... shadow-nubank`, antes de "Bônus por perfil"):

```tsx
{promo.category === 'transfer' && promo.sourceProgram && promo.targetProgram && (
  <RotaHistoricoBlock
    source={promo.sourceProgram}
    target={promo.targetProgram}
    bonusAtual={promo.bonusNumeric ?? null}
  />
)}
```

- [ ] **Step 4: Gates**

`npx tsc -b` (limpo) · `npm test` (toda a suíte + os novos) · `npm run build` (ok).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/usePromoHistoricoRota.ts src/components/bonus/RotaHistoricoBlock.tsx src/pages/BonusOfferDetailScreen.tsx
git commit -m "feat(usuario): bloco 'Histórico da rota' no detalhe da transferência"
```

---

## Self-Review

- **Cobertura:** RPC definer (Task 1) ✓; service + resumo puro + testes (Task 2) ✓; hook + bloco + fiação (Task 3) ✓; degrada gracioso (resumoHistorico novo) ✓; só transfer com source+target (Task 3 guard) ✓.
- **Placeholders:** nenhum; código completo em cada step.
- **Rollout:** migration aplicada com OK do owner (checkpoint na execução).
