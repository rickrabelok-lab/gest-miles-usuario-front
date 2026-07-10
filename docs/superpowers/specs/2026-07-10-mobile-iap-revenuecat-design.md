# IAP via RevenueCat no app Android (Capacitor) — Design

**Data:** 2026-07-10
**Status:** aprovado pelo owner (formato mensal + anual com desconto; contas Play Console/RevenueCat ainda NÃO existem — código entra pronto com degradação graciosa e o E2E real de compra fica pro rollout)

## Problema

A monetização B2C do app mobile deve ir pela loja (Google Play Billing), não Stripe (decisão antiga do owner; regra das lojas proíbe vender digital fora da IAP dentro do app). Hoje:

- O gate existe e funciona: `RequirePaid` protege 4 telas via `useEntitlement` → `perfis.plano_ativo` (B2B, agência) OU `perfis.subscription_status` ∈ {active, trialing} (B2C). Flag `B2C_PLAN_GATE_ENABLED` via env (off por default).
- `PlanoInativoScreen` (upsell) é estático, sem CTA de compra.
- `/assinatura` (Stripe B2C) é alcançável pelo menu ☰ (`DashboardHeader`) e pelo Perfil — não pode aparecer no app.
- O webhook Stripe **B2B (equipes) está ATIVO** — o caminho novo não toca nele.

## Decisões

1. **RevenueCat** (vs Play Billing direto): valida recibo, gerencia renovação/cancelamento/grace, manda eventos limpos pro webhook; iOS futuro = mesma tela + chave nova. Grátis até ~US$2,5k/mês de receita.
2. **Formato do produto: mensal + anual com desconto** (2 packages na Offering default do RC). Preços vêm da loja em runtime — nada hardcoded; o selo de economia do anual é calculado dos preços reais.
3. **Zero Trust**: o entitlement continua sendo lido do `perfis` (RLS) como hoje; quem escreve é o **webhook do RevenueCat no BFF** (service role). O retorno da compra no app serve só pra UX imediata.
4. **Degradação graciosa**: sem `VITE_REVENUECAT_ANDROID_KEY` configurada, o app funciona normal e a tela de assinatura nativa mostra estado "em breve" — permite mergear antes das contas existirem.
5. **Coluna nova `perfis.subscription_provider`** (`'play'`/`'apple'`; linhas Stripe legadas ficam `null`) — auditabilidade no caminho de dinheiro. Migration aditiva no banco compartilhado, **aplicar só com OK explícito do owner**, com espelho no repo manager (padrão canônico).

## Componentes

### 1. `src/lib/revenuecat.ts` (novo) — wrapper do SDK

Módulo fino sobre `@revenuecat/purchases-capacitor` (dynamic import — nada de RC no bundle path da web):

- `isRevenueCatAvailable(): boolean` — nativo E `VITE_REVENUECAT_ANDROID_KEY` presente.
- `configureRevenueCat(appUserID: string): Promise<void>` — `Purchases.configure({ apiKey, appUserID })`; idempotente (configura 1× por launch; troca de usuário via `Purchases.logIn`).
- `logOutRevenueCat(): Promise<void>` — `Purchases.logOut()` (ignora erro se não configurado).
- `getPaywallOfferings(): Promise<PaywallData | null>` — busca a Offering current, extrai packages MONTHLY e ANNUAL (`priceString`, `pricePerYear` p/ cálculo da economia); `null` se indisponível.
- `purchase(pkg): Promise<PurchaseOutcome>` — `purchasePackage`; mapeia cancelamento pelo usuário (`userCancelled`) vs erro real.
- `restorePurchases(): Promise<boolean>` — true se alguma entitlement ativa voltou.
- Tipos próprios (`PaywallData`, `PurchaseOutcome`) pra UI não depender dos tipos do SDK.

**`appUserID` = `user.id` do Supabase** — é o elo compra→perfil que o webhook usa. Nunca usar ID anônimo do RC pra usuário logado.

### 2. `src/components/RevenueCatBootstrap.tsx` (novo) — ciclo de vida

Componente sem UI (dentro do `AuthProvider`): quando nativo+key e há `user`, chama `configureRevenueCat(user.id)` (ou `logIn` se o usuário mudou); no sign-out, `logOutRevenueCat()`. Erros só logam (`console.warn`) — RC indisponível nunca quebra o app.

### 3. `src/pages/AssinaturaAppScreen.tsx` (novo) — paywall/gestão (só nativo)

Identidade nubank (roxo `#8A05BE`, DM Sans/Space Grotesk, mobile-first `max-w-md`):

- **Estado free**: cards Mensal e Anual lado a lado (anual com selo "economize X%" calculado de `pricePerYear` mensal vs preço anual), CTA de compra → fluxo nativo do Play → sucesso: toast + `refreshRole()` com retry curto (o webhook aterrissa em segundos) → volta pra tela anterior. Cancelou a compra: silencioso. Erro: toast.
- **Estado pago** (`useEntitlement`): mostra plano atual + botão "Gerenciar assinatura" (abre `https://play.google.com/store/account/subscriptions` via `@capacitor/browser`).
- **Sempre**: botão "Restaurar compras" (exigência de loja; sucesso → `refreshRole`), links Termos/Privacidade (exigência de loja).
- **RC indisponível** (sem key/offerings): estado "Assinatura em breve" — sem crash.

### 4. Roteamento e entradas (mudança em arquivos existentes)

- `src/App.tsx`: rota `/assinatura` passa a renderizar um wrapper `AssinaturaRoute` → nativo: `AssinaturaAppScreen`; web: `AssinaturaClientePage` (Stripe, intocada). Menu ☰ e Perfil continuam apontando pra `/assinatura` — zero link morto.
- `PlanoInativoScreen`: no nativo, ganha CTA "Ver planos" → `/assinatura`; na web, texto atual inalterado.

### 5. Backend: `backend/src/routes/revenuecatWebhook.js` (novo)

- `POST /api/revenuecat/webhook`, montado no `index.js` (JSON normal — RC não exige raw body; auth é por header).
- **Auth**: header `Authorization` deve bater exatamente com `process.env.REVENUECAT_WEBHOOK_SECRET` (RC manda o valor configurado verbatim). Sem env → 503; header errado → 401. Comparação constante-time (`crypto.timingSafeEqual`).
- **Payload** (`body.event`): usa `type`, `app_user_id`, `product_id`, `expiration_at_ms`, `period_type`, `store`.
- `app_user_id` anônimo (`$RCAnonymousID:…`) ou não-UUID → 200 + log (nada a fazer; RC retenta em não-2xx).
- **Mapeamento de status — dirigido por expiração** (regra única, robusta a todos os eventos):

| Evento RC | Efeito |
|---|---|
| `INITIAL_PURCHASE`, `RENEWAL`, `UNCANCELLATION`, `PRODUCT_CHANGE`, `BILLING_ISSUE` | `expiration_at_ms` no futuro → `subscription_status = period_type==='TRIAL' ? 'trialing' : 'active'`; no passado → `'canceled'` |
| `CANCELLATION` | auto-renew desligado, acesso continua até expirar → mesma regra acima (fica `active` até a `EXPIRATION`) |
| `EXPIRATION` | `'canceled'` |
| `TRANSFER`, `TEST`, outros | 200 + log, sem escrita |

- **Escrita** (service role, `perfis` por `usuario_id = app_user_id`): `subscription_status`, `subscription_plan_slug = product_id`, `subscription_current_period_end = expiration_at_ms` (ISO), `subscription_provider = store==='APP_STORE' ? 'apple' : 'play'`. **Nunca toca `stripe_*` nem `plano_ativo`**; caminho B2B (equipes) intocado.

### 6. Migration (banco compartilhado — só com OK do owner)

```sql
alter table public.perfis add column if not exists subscription_provider text;
comment on column public.perfis.subscription_provider is
  'Origem da assinatura B2C: play | apple (RevenueCat). null = legado Stripe/sem assinatura.';
```

Aditiva, sem RLS nova (coluna coberta pelas policies existentes de `perfis`). Espelhar no repo manager (SQL canônico).

### 7. Env

| Var | Onde | Uso |
|---|---|---|
| `VITE_REVENUECAT_ANDROID_KEY` | `.env.mobile` / `.env.example` | chave PÚBLICA do SDK (como Stripe publishable — pode ir no bundle) |
| `REVENUECAT_WEBHOOK_SECRET` | `backend/.env` / Vercel backend | segredo do header Authorization do webhook |

### 8. Runbook de rollout (owner) — `docs/revenuecat_setup.md` (novo)

Passo a passo completo pra quando as contas existirem: Play Console (US$25) → criar app + keystore de upload + AAB na trilha de teste interno → criar as 2 subscriptions (base plans mensal/anual) → license testers → RevenueCat: projeto, credencial do Play (service account), entitlement `paid`, products, Offering default (monthly+annual), webhook (URL do BFF + secret) e API key → envs na Vercel → teste de compra sandbox. Até lá, nada disso bloqueia o merge.

## Fora de escopo (consciente)

- iOS (mesma tela; entra quando houver conta Apple), trials/promoções do RC, paywall na web (web mantém Stripe congelado/“fale com a agência”), evento `TRANSFER` (log apenas), reconciliação retroativa de assinaturas Stripe B2C legadas, ligar a flag `B2C_PLAN_GATE_ENABLED` (decisão de rollout do owner, não desta feature).

## Verificação

- **Unit (Vitest)**: mapeamento evento RC→status (payloads reais de exemplo, incluindo BILLING_ISSUE com expiração futura, CANCELLATION antes da expiração, anônimo, não-UUID, TRANSFER); auth do webhook (sem env/503, errado/401, certo/200); `AssinaturaAppScreen` com offerings mockadas (cards, selo de economia, estados pago/indisponível); `AssinaturaRoute` por plataforma; suíte existente intacta.
- **Backend**: testes da rota no padrão dos existentes (`stripeWebhook.routing.test.js`).
- **Estática/builds**: `npx tsc -b` + `npm test` + `npm run build` + `npm run mobile:sync` + `gradlew assembleDebug` (BUILD SUCCESSFUL antes de instalar).
- **Device (sem loja)**: app abre normal sem a key; tela de assinatura mostra "em breve"; menu/Perfil navegam certo; web `/assinatura` continua a página Stripe.
- **E2E real de compra**: adiado pro rollout com contas (runbook).
