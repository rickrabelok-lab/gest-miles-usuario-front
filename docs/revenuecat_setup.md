# RevenueCat / Google Play — runbook de rollout do IAP

Pré-requisito de código: PR do IAP mergeado (paywall + webhook + migration no repo).
Nada disso bloqueia deploy — sem as envs, o app mostra "Assinatura em breve" e o
webhook responde 503.

## 1. Banco (com OK do owner — projeto compartilhado)

Aplicar `supabase/migrations/20260710190000_perfis_subscription_provider.sql`
(SQL Editor ou MCP). Antes de configurar o webhook no RC.

## 2. Google Play Console (~US$25, 1x)

1. Criar conta em https://play.google.com/console (dados fiscais/bancários p/ receber).
2. Criar o app **Gest Miles** (`br.com.gestmiles.app`).
3. Gerar keystore de UPLOAD (guardar bem — perda = processo chato de reset):
   `keytool -genkey -v -keystore gestmiles-upload.keystore -alias upload -keyalg RSA -keysize 2048 -validity 10000`
4. Build de release assinado (AAB): `cd android; .\gradlew.bat bundleRelease` com a
   signingConfig apontando pro keystore (adicionar em `android/app/build.gradle` — a
   config de release entra num PR próprio quando chegar a hora; a trilha interna aceita
   o primeiro AAB manualmente).
5. Subir o AAB na trilha **Teste interno** + adicionar seu e-mail como testador.
6. **Monetizar → Produtos → Assinaturas**: criar `gm_plus` com 2 base plans:
   - `gm-plus-mensal` (renovação mensal) — definir preço BRL;
   - `gm-plus-anual` (renovação anual) — definir preço BRL com desconto.
7. **Configurações → Acesso à API**: criar/vincular projeto Google Cloud, criar
   service account, conceder permissões financeiras (Ver dados financeiros +
   Gerenciar pedidos e assinaturas). Baixar o JSON da service account.

## 3. RevenueCat (grátis até ~US$2,5k/mês)

1. Criar conta em https://app.revenuecat.com → novo projeto **GestMiles**.
2. Adicionar app **Play Store** (`br.com.gestmiles.app`) e subir o JSON da service
   account (a validação do Google pode levar até ~36h na primeira vez).
3. **Entitlements**: criar `paid`.
4. **Products**: importar/registrar `gm_plus:gm-plus-mensal` e `gm_plus:gm-plus-anual`;
   anexar ambos à entitlement `paid`.
5. **Offerings**: na offering `default`, criar 2 packages: `$rc_monthly` → produto
   mensal; `$rc_annual` → produto anual. (O app lê `current.monthly/annual`.)
6. **Integrations → Webhooks**: URL
   `https://<URL-DO-BACKEND-NA-VERCEL>/api/revenuecat/webhook`; em
   **Authorization header value**, colar EXATAMENTE o valor escolhido pra
   `REVENUECAT_WEBHOOK_SECRET` (gerar um segredo forte, ex. `openssl rand -hex 32`).
7. **API Keys**: copiar a chave PÚBLICA Android (`goog_...`).

## 4. Envs

- Vercel (projeto do BACKEND): `REVENUECAT_WEBHOOK_SECRET=<segredo>` → redeploy.
- `.env.mobile` (local): `VITE_REVENUECAT_ANDROID_KEY=goog_...` → `npm run mobile:sync`
  → rebuild do APK/AAB.

## 5. Teste sandbox (sem gastar)

1. No Play Console, **Configurações → Teste de licença**: adicionar seu e-mail
   (compras de teste não são cobradas).
2. Instalar o build da trilha interna (link de opt-in) no device com essa conta.
3. Comprar o mensal → conferir: entitlement libera as 4 telas gated; linha do
   `perfis` com `subscription_status=active`, `subscription_provider=play`;
   evento no dashboard do RC; log do webhook na Vercel.
4. Testar cancelamento (Play → Assinaturas) → acesso continua até expirar;
   sandbox expira rápido (minutos) → depois `subscription_status=canceled`.
5. "Restaurar compras" após `pm clear` → entitlement volta.

## Solução de problemas

- Paywall "em breve" com key preenchida → offerings vazias: produtos não anexados
  à offering `default`, ou app ainda não revisado na trilha interna, ou conta do
  device não é testadora.
- Webhook 401 → valor do header no RC ≠ `REVENUECAT_WEBHOOK_SECRET`.
- Webhook 200 mas perfis não muda → `app_user_id` anônimo (compra feita antes do
  login? o bootstrap configura no login) — conferir logs `[revenuecat]` na Vercel.
