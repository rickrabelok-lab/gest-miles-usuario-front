# Design: "Pra você" — personalização do hub de promoções (Fase 3-A)

**Data:** 2026-07-12
**Status:** Aprovado em conceito pelo owner (superfície + regra de match + escopo fechados); aguardando revisão final do spec
**Autor:** Rick Rabelok + Claude
**Spec-mãe:** `docs/superpowers/specs/2026-07-11-promocoes-automaticas-design.md` (Fase 3 — Personalização)

---

## Visão Geral

Primeira fatia da Fase 3 do pipeline de promoções: cruzar as promoções aprovadas (`promo_alerts`) com a **carteira real do cliente** (`programas_cliente`) e mostrar, no hub `/bonus-offers`, uma seção **"Pra você"** com as transferências bonificadas que o cliente **pode aproveitar agora** — junto do cálculo do resultado ("Seus 82.000 Livelo → 164.000 na Smiles").

**Tese de produto (herdada da spec-mãe):** feed genérico é commodity. O diferencial Gest Miles é o cruzamento com a carteira. Esta fatia entrega esse cruzamento na **superfície de menor risco** (in-app, pull, client-side), validando a lógica de matching antes de qualquer disparo proativo.

**Estado atual (verificado 2026-07-12):**
- Hub `/bonus-offers` (`BonusOffersScreen.tsx`) roda com dado real via `promo_alerts` (fases 1/1.1 no ar): header + pills (`Tudo/Transferências/Compras/Milhas/Cartões`) + 4 seções por categoria.
- `useBonusPromotions(category)` lê promos aprovadas/vigentes via `getActivePromoAlerts` (`src/lib/promo-alerts/service.ts`) — BFF quando `hasApiUrl()`, senão Supabase RLS direto.
- `useProgramasCliente()` lê a carteira do cliente logado (`programas_cliente`, RLS por `cliente_id`): cada row tem `program_id` (slug), `program_name` (display) e `saldo` (number).

---

## Decisões registradas (owner, 2026-07-12)

1. **Superfície:** in-app "Pra você" **primeiro** (pull, client-side). O disparo proativo por WhatsApp fica pra Fase 3-B.
2. **Regra de match:** "Pra você" = cliente tem o programa **de origem com `saldo > 0`**. Só o acionável agora; permite mostrar o cálculo do resultado.
3. **Superfície de UI:** apenas a **seção dedicada** no topo do hub. Sem selo "Pra você" nas linhas dentro da seção Transferências (evita duplicar).
4. **Escopo de categoria:** apenas **transferências** (`category = 'transfer'`) — é onde "origem com saldo" faz sentido e onde existe o cálculo "seus X → Y". `miles`/`shopping`/`cards` ficam de fora (follow-up).

---

## Escopo

**Dentro:** seção "Pra você" no hub, 100% **client-side**, apenas categoria `transfer`, com cálculo do resultado. **Zero backend, zero migration, zero WhatsApp, sem opt-out/frequência** (é pull — o cliente abre o app).

**Fora (follow-ups):**
- `miles`/`shopping`/`cards` no "Pra você".
- "Pra você" na Home (hero/`Index.tsx`).
- Disparo proativo por WhatsApp (Fase 3-B) — reusa a mesma lógica de matching validada aqui.
- Milheiro (R$/1.000) no cálculo — adiado pelo owner.
- CTA "cadastre seus programas" no empty state.
- **Confirmar sync manager:** verificar se o hub de bônus é forkado no `gest-miles-manager-front` (regra `sync-user-app-changes-to-manager`). Se sim, replicar a seção lá.

---

## Arquitetura

Tudo no front, reaproveitando dados que o cliente já lê por RLS. Nenhuma nova leitura de tabela, nenhuma escrita.

```
useBonusPromotions('transfer')  ──┐
  (promos aprovadas/vigentes)     │
                                  ├─→ usePersonalizedPromos()  ──→  <PraVoceSection/>
useProgramasCliente()          ──┘     cruza origem×carteira            (topo do hub +
  (carteira: program_id, saldo)          + calcula resultado             pill "Pra você")
```

### 1. Matching — `src/lib/promo-alerts/matching.ts` (novo)

Unidade isolada e testável. Responsabilidade única: normalizar o nome de programa (texto livre do LLM) para um `program_id` do catálogo.

- `normalizeProgramToId(text: string): string | null`
  - Normaliza: `toLowerCase`, remove acentos, colapsa tudo que não é `[a-z0-9]`.
  - Casa contra uma **tabela de alias** (`PROGRAM_ALIASES`) que cobre as **origens de transferência** (conjunto pequeno e estável) + apelidos comuns. Retorna `null` se não reconhecer (nunca "chuta").
  - Exemplos: `"Livelo"`→`livelo`; `"Esfera"`→`esfera`; `"Itaú"`/`"Itau"`→`itau`; `"Inter"`/`"Inter Loop"`→`inter-loop`; `"C6"`/`"Átomos"`→`atomos-c6`; `"Amex"`→`amex`; desconhecido→`null`.
- A tabela de alias vive no próprio módulo (não acopla a `Index.tsx`); os `program_id` são os slugs canônicos de `PROGRAM_CATEGORY` (`src/components/programSelectionUtils.ts`).
- **Match:** uma promo `transfer` é "pra você" se `normalizeProgramToId(promo.sourceProgram)` for igual ao `program_id` de alguma row da carteira com `saldo > 0`.

### 2. Tipo — extensão aditiva de `BonusPromotion` (`src/lib/bonusTypes.ts`)

O `mapPromoAlertRow` hoje descarta `source_program` (exceto em `participatingBanks`) e não mapeia `bonus_numeric`. Adicionar (aditivo, sem quebrar consumidores):

- `sourceProgram?: string` — texto cru da origem (pro match).
- `bonusNumeric?: number` — percentual do bônus (pro cálculo do resultado).

Mapear ambos em `mapPromoAlertRow` a partir de `row.source_program` / `row.bonus_numeric` (o `select` do service já traz as duas colunas).

### 3. Hook — `src/hooks/usePersonalizedPromos.ts` (novo)

- Consome `useBonusPromotions('transfer')` (promos) + `useProgramasCliente()` (carteira).
- Para cada promo, resolve o `program_id` da origem e procura na carteira uma row com esse id e `saldo > 0`.
- Monta itens `{ promo, programId, programName, saldo, bonusNumeric, resultado }` onde
  `resultado = round(saldo × (1 + bonusNumeric / 100))`. Sem `bonusNumeric` → `resultado = null` (mostra sem o número; raro em transfer).
- Ordena por `resultado` desc (fallback: `bonusNumeric` desc).
- Retorna `{ items, loading, error }`. Sem sessão / sem carteira / nada bate → `items` vazio.
- Lógica pura de cruzamento extraída pra função testável (ex.: `crossPromosWithWallet(promos, walletRows)`), pro hook ficar fino.

### 4. UI — `PraVoceSection` + pill (`BonusOffersScreen.tsx`)

- `src/components/bonus/PraVoceSection.tsx` (novo): renderiza acima das 4 seções de categoria. Reusa os componentes de linha/detalhe existentes; cada item ganha, em destaque (voz da marca, roxo `#8A05BE`), a linha do resultado: **"Seus {saldo} {origem} → {resultado} na {destino}"** (números em pt-BR).
- Pill novo **"Pra você"** como **primeiro** item de `PILLS` em `BonusOffersScreen`; clicar dá scroll pra seção (mesma mecânica de refs já usada).
- **Guards / empty:** `items.length === 0` → seção **não renderiza** (nem título, nem pill destacado sem conteúdo) — não polui o hub pra quem não tem match. Sem duplicação: os mesmos cards seguem aparecendo na seção Transferências normal.

---

## Erros e resiliência

- Origem não reconhecida pelo `normalizeProgramToId` → item simplesmente não entra no "Pra você" (aparece só na seção Transferências). Sem erro visível. Alias novo é ajuste de 1 linha.
- Carteira ainda carregando → seção some/aparece quando os dados chegam (sem flicker de erro; `loading` combinado dos dois hooks).
- `bonus_numeric` ausente/`0` → item ainda casa (match é por saldo>0), mas sem o número do resultado.
- `saldo` inconsistente (NaN/negativo vindo do state) → normalizar com `Number()` e tratar `> 0` estritamente.

## Testes (Vitest — rede de segurança principal)

- `src/lib/promo-alerts/matching.test.ts`: normalização de nomes (Livelo, Esfera, Itaú com/sem acento, Inter/Inter Loop, C6/Átomos) → id certo; desconhecido → `null`.
- `src/hooks/usePersonalizedPromos.test.tsx` (ou o teste da função pura `crossPromosWithWallet`): cruza mock de promos × carteira; casa só com `saldo>0`; calcula `resultado` (ex.: 82.000 × 100% → 164.000); ordena por resultado desc; vazio quando nada bate / sem carteira.
- Padrão da casa: descrição PT-BR, `vi.clearAllMocks()` no `beforeEach`, hook/dado injetado por prop/mock quando der (espelhar `bonus-offers/service.test.ts` e `useBonusPromotions.test.tsx`).

## Gates antes de "pronto"

`npx tsc -b` (type-check real) + `npm test` + `npm run build`. Rodar os três; não dizer "pronto" sem evidência.

## Custos

Zero incremental — nenhuma chamada nova de rede, nenhuma migration, nenhum LLM. Só render client-side de dados já carregados.

## Fora de escopo (reafirmado)

- Qualquer escrita/tabela/migration/RLS nova.
- Disparo proativo (WhatsApp/FCM) — Fase 3-B.
- Milheiro no cálculo; miles/shopping/cards; "Pra você" na Home; onboarding de programas no empty state.
