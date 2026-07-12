# Design: Histórico de bônus por rota (Fase 4 — ativo de dados)

**Data:** 2026-07-12
**Status:** Aprovado em conceito pelo owner; aguardando revisão final do spec
**Autor:** Rick Rabelok + Claude
**Spec-mãe:** `docs/superpowers/specs/2026-07-11-promocoes-automaticas-design.md` (Fase 4)

---

## Visão Geral

Transformar o acúmulo de `promo_alerts` num **ativo de dados**: pra cada rota de transferência (ex.: Livelo→Smiles), mostrar o histórico do bônus — "já teve N vezes, média X%, máximo Y%, a atual (Z%) está acima da média". Não existe dado público disso no BR; **construímos o nosso a partir de agora**.

**Realidade (verificada 2026-07-12):** o pipeline tem **~1 dia de dados** (12 transfers, 9 rotas, 0 aprovadas). O ativo está **vazio hoje** e cresce em semanas/meses. Decisão do owner: **construir view + UI agora** (pronto pra brilhar; degrada gracioso com dado ralo). Moderar as 4 transfers pending já semeia o histórico.

---

## Decisões registradas (owner, 2026-07-12)

1. **Base do histórico:** promos **`approved` + `expired`** (campanhas reais curadas). Exclui `rejected` (falsos) e `pending` (não confirmados).
2. **UI:** **bloco "Histórico da rota" no detalhe** da promo transfer (contextual). Tela dedicada de browse = follow-up.
3. **Construir view + UI agora**, aceitando display ralo hoje.

---

## Arquitetura

### Banco — RPC `SECURITY DEFINER` (migration nova; apresentar SQL + OK do owner antes de aplicar)

**Por que definer:** a RLS de `promo_alerts` só entrega ao cliente `approved` **E vigente** — então uma view/leitura direta **esconderia as campanhas expiradas**, que são justamente o histórico. Uma RPC `SECURITY DEFINER` roda como owner (vê todas as approved+expired) e devolve **só agregados** (não-sensível — é info pública de promo). Padrão da casa (RPC definer pra leitura controlada, ex.: `timeline_eventos_push`, `promo_norm`).

```sql
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

- Reusa `promo_norm` (já em prod, da 3-B) pra casar as grafias de programa.
- Agrega por rota; `vezes` = nº de campanhas (linhas canônicas) na rota. Inclui a promo atual (é approved) — daí `vezes=1` = só a atual = "sem histórico ainda".

### Front

- **`src/lib/promo-alerts/historico.ts`** (novo):
  - `getPromoHistoricoRota(source, target, {signal?}): Promise<HistoricoRota | null>` — chama `supabase.rpc('promo_historico_rota', { p_source, p_target })`, mapeia a 1ª linha.
  - `type HistoricoRota = { vezes: number; bonusMedio: number|null; bonusMax: number|null; bonusMin: number|null; primeira: string|null; ultima: string|null }`.
  - `resumoHistorico(h: HistoricoRota | null, bonusAtual: number | null): { novo: boolean; texto: string; sinal: 'acima'|'abaixo'|'na_media'|null; vezes: number; bonusMedio: number|null; bonusMax: number|null }` — **função pura testável**: `vezes<=1` ou null → `{ novo:true }`; senão calcula o sinal (`bonusAtual > bonusMedio` → 'acima'; `<` → 'abaixo'; senão 'na_media').
- **`src/hooks/usePromoHistoricoRota.ts`** (novo): `usePromoHistoricoRota(source, target, enabled)` — TanStack Query chamando o service; `enabled` só quando é transfer com source+target.
- **`src/components/bonus/RotaHistoricoBlock.tsx`** (novo): consome o hook + `resumoHistorico` e renderiza o card. Placeholder gracioso: `novo` → "Primeira vez que registramos essa rota — vamos acompanhar o histórico daqui pra frente."; com histórico → "Essa rota já teve bônus {vezes}× · média {medio}% · máx {max}%" + selo de bom momento quando `sinal==='acima'`.
- **`src/pages/BonusOfferDetailScreen.tsx`** (modificar): na aba "Promoção", só quando `promo.category === 'transfer' && promo.sourceProgram && promo.targetProgram`, renderiza `<RotaHistoricoBlock source={promo.sourceProgram} target={promo.targetProgram} bonusAtual={promo.bonusNumeric ?? null} />` (após o hero / antes do CTA).

---

## Regras

- **Rota** = `promo_norm(source_program)` × `promo_norm(target_program)` (mesma normalização da 3-B).
- **Base:** `status in ('approved','expired')`, `bonus_numeric not null`, `category='transfer'`.
- **Sinal "bom momento":** `bonusAtual > bonusMedio` → destaque; caso contrário neutro. Só aparece com `vezes>1` (histórico real).
- **Degrada gracioso:** `vezes<=1` → mensagem de "primeira aparição" (o caso de HOJE pra quase toda rota).

## Erros e resiliência

- RPC falha / sem dados → o bloco não renderiza (ou mostra o placeholder neutro); nunca quebra o detalhe.
- Rota sem match (origem não normalizável) → `vezes=0` → placeholder de "primeira aparição".

## Testes (Vitest)

- `historico.test.ts` (`resumoHistorico`): `null`/`vezes<=1` → `novo:true`; `vezes>1` com `bonusAtual` acima/na/abaixo da média → sinal certo; formatação dos números.
- `usePromoHistoricoRota.test.tsx` (leve): mock do service; `enabled=false` não chama; mapeia o retorno.
- Gates: `npx tsc -b` + `npm test` + `npm run build`.

## Fora de escopo (follow-ups)

- **Tela dedicada** "Histórico de rotas" (browse do ativo inteiro).
- Gráfico/timeline do bônus ao longo do tempo.
- Histórico pra `miles`/`shopping`/`cards`.
- Excluir a campanha atual do cálculo da média (viés leve; irrelevante com poucos pontos).
- Sync manager (se o hub/detalhe for forkado lá).

## Nota de dado

O ativo só ganha valor com acúmulo. **Moderar as 4 transfers pending semeia o histórico imediatamente**; a riqueza vem com as semanas de pipeline.
