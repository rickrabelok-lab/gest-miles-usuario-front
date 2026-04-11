# Configuração Stripe (monetização)

**Deploy do Express (webhook):** guia executável em **[deploy_backend_passo_a_passo.md](./deploy_backend_passo_a_passo.md)** (Railway, Render ou Docker).

### Chaves API

No Stripe Dashboard: **Developers → API keys**

- **Publishable key** (`pk_test_...` / `pk_live_...`) → front: `VITE_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- **Secret key** (`sk_test_...`) → backend: `STRIPE_SECRET_KEY` (também pode estar em `.env.local` na raiz; o `backend/src/load-env.js` carrega `../.env.local`)

### Webhook (obrigatório para sincronizar assinaturas)

**Developers → Webhooks → Add endpoint**

- **URL:** `https://<seu-dominio-da-api>/api/stripe/webhook`  
  Exemplo local com túnel (ngrok, etc.): `https://abc.ngrok.io/api/stripe/webhook`

**Signing secret** (`whsec_...`) → `STRIPE_WEBHOOK_SECRET` no backend.

**Eventos recomendados:**

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

### Variáveis relacionadas

| Variável | Onde |
|----------|------|
| `PUBLIC_APP_URL` | Backend — URL pública do front (checkout/cancel redirect, billing portal). |
| `VITE_API_URL` | Front — URL do Express que expõe `/api/stripe/*`. |
| `VITE_ADMIN_APP_URL` | App de clientes — redireciona `admin` para o painel Admin (ex.: `http://localhost:3000`). |

### Consola de monetização (Stripe)

A gestão de planos e assinaturas na API Stripe está no **front Admin** (`gest-miles-admin-front`), rota **`/monetizacao`**. Requer `VITE_API_URL` apontando ao backend e sessão com perfil `admin`.

### Página de subscrição (clientes)

No app de utilizadores, a rota **`/assinatura`** lista planos públicos (`GET /api/stripe/plans`), inicia Checkout (`POST /api/stripe/checkout-session`) e o portal de faturação (`POST /api/stripe/billing-portal`).
