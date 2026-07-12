# Design: tela dedicada "Histórico de rotas" (browse da fase 4)

**Data:** 2026-07-12
**Status:** Aprovado pelo owner (brainstorm). Front + 1 RPC novo (migration no banco compartilhado → OK do owner antes de aplicar).

---

## Problema

A fase 4 entregou histórico de bônus **por rota** só no detalhe da transferência (`RotaHistoricoBlock` + RPC `promo_historico_rota(source,target)`). Não há como **navegar** as rotas — ver quais já deram bônus, com que frequência e quão bom. O cliente não consegue enumerar isso do lado dele: a RLS de `promo_alerts` **esconde as expiradas** (que são o histórico), então um browse exige um RPC definer de LISTA.

**Dado real (medido 2026-07-12):** 4 rotas de transfer distintas, **3 com histórico** (approved+expired com bônus). O dado é bagunçado (`source_program` null, `"Livelo, Esfera"` combinado, `"Inter Loop"` vs `"Inter"`) → agrupar pelos **slugs materializados** (`source_program_id`/`target_program_id`, ambos não-null; PR #89) resolve. A tela tem conteúdo hoje, enxuto; cresce com o acúmulo.

## Decisões (owner)

- **Escopo v1: só transfer** (bônus %). miles/shopping/cards ficam pra depois (métricas heterogêneas).
- **Ordem: mais recente** (`ultima` desc).

## Solução

### Banco — RPC novo `promo_historico_rotas()` (migration; OK do owner antes de aplicar)

SECURITY DEFINER (mesma razão do per-rota: ver expiradas), stable, `set search_path = public, pg_temp`, `revoke all from public` + `grant execute to anon, authenticated`. Devolve só agregados (público, sem PII).

```sql
create or replace function public.promo_historico_rotas()
returns table (
  source_id text, target_id text, source_nome text, target_nome text,
  vezes int, bonus_medio numeric, bonus_max numeric, bonus_min numeric,
  primeira date, ultima date
)
language sql stable security definer
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

Espelha o filtro do `promo_historico_rota` (transfer, approved+expired, bonus not null); só troca "1 rota" por "todas agrupadas por slug". Rollback: `drop function public.promo_historico_rotas();`.

### Front (client-side, Zero-Trust OK — só agregados públicos)

- **`src/lib/promo-alerts/historico.ts`** (estende o existente):
  - `interface HistoricoRotaLista { sourceId, targetId, sourceNome, targetNome, vezes, bonusMedio, bonusMax, bonusMin, primeira, ultima }`
  - `getPromoHistoricoRotas(opts?): Promise<HistoricoRotaLista[]>` — `supabase.rpc('promo_historico_rotas')`, mapeia as linhas com o helper `num()` existente. `[]` se `!isSupabaseConfigured` ou erro tratado.
  - `formatUltima(iso: string | null): string` puro — `'jul/26'` a partir de `YYYY-MM-DD` (mês pt-BR abreviado + ano 2 dígitos). Testável.
- **`src/hooks/usePromoHistoricoRotas.ts`**: `useQuery({ queryKey:['promo-historico-rotas'], queryFn: getPromoHistoricoRotas })`.
- **`src/pages/HistoricoRotasScreen.tsx`**: header (voltar + "Histórico de rotas") + lista de cards. Cada card: **"Livelo → Smiles"** (nomes) · linha de stats **"5× · média 85% · máx 100%"** · rodapé **"última jul/26"**. Design nubank (rounded-[20px], bg-white, shadow-nubank, cores da marca — como o `RotaHistoricoBlock`). Estados: loading (skeleton/texto), erro (mensagem), **vazio honesto** ("Ainda estamos acumulando o histórico das rotas — volte em breve.").
- **Rota** em `src/App.tsx`: `/bonus-offers/rotas` dentro de `ClienteOnly` (sem `RequirePaid`? — seguir o padrão do detalhe `/bonus-offers/:id` que é só `ClienteOnly`). Fica ANTES/melhor-ranqueada que `/bonus-offers/:id` (segmento estático vence dinâmico no React Router v6).
- **Entrada** no hub `src/pages/BonusOffersScreen.tsx`: link discreto "Histórico de rotas →" (ex.: abaixo do notice, ou no header ao lado do pill de contagem) → `navigate('/bonus-offers/rotas')`.

### Interação (v1)

Lista estática informativa (tap não navega). Interação (tap → filtrar hub / ir pra oferta ativa da rota) fica como follow-up.

---

## Testes (Vitest — a rede de segurança principal)

- `historico.test.ts` (estende): `getPromoHistoricoRotas` mapeia linhas do RPC (mock do supabase.rpc) → array tipado; `[]` quando não configurado; `formatUltima` (vários meses, null → ''/'—').
- Sem teste de componente pesado; a lógica pura (map + format) é o alvo. Screen é apresentação.

## Rollout

1. Migration: escrever o SQL; **aplicar via MCP com OK do owner** (banco compartilhado). Verificar: RPC devolve as ~3 rotas com agregados corretos; grant anon/authenticated; advisors 0 ERROR novo.
2. Front: lib + hook + tela + rota + link (TDD na lib). Gates: `tsc -b` + `npm test` + `npm run build`.
3. Smoke visual: rodar o app, abrir `/bonus-offers` → link → `/bonus-offers/rotas`, conferir a lista real + empty state (ver [[conta-teste-cliente-smoke]]).
4. PR + memória. Regra [[sync-user-app-changes-to-manager]]: confirmar se o hub de bônus é forkado no manager (se sim, replicar).

## Riscos

- **Migration em prod compartilhada** — read-only definer, baixo risco, espelha RPC existente; OK do owner obrigatório.
- **Nomes representativos** — `array_agg ... order by created_at desc` pode pegar uma grafia feia ("Inter Loop"); aceitável v1 (o slug garante o agrupamento). Follow-up: nome canônico via `program_aliases`.
- **Dado ralo** — empty/enxuto hoje; o empty state cobre.

## Fora de escopo

- miles/shopping/cards no histórico.
- Interação (tap na rota), gráfico/timeline por rota.
- Nome canônico de programa.
