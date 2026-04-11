# API REST — BFF Gest Miles (`gest-miles-usuario-front/backend`)

Base URL: defina `VITE_API_URL` no front (ex.: `http://localhost:3000`).

## Saúde

| Método | Caminho | Descrição |
|--------|---------|-----------|
| GET | `/api/health` | `ok`, `timestamp` |

## Autenticação (opcional para apps que usam Supabase no browser)

| Método | Caminho | Descrição |
|--------|---------|-----------|
| POST | `/api/auth/login` | Corpo: `{ email, password }` |
| POST | `/api/auth/signup` | Corpo: `{ email, password }` |
| POST | `/api/auth/magic-link` | Corpo: `{ email, redirectTo? }` |
| GET | `/api/auth/session?token=` | Valida token |
| GET | `/api/auth/user?token=` | Utilizador |
| POST | `/api/auth/request-password-reset` | Corpo: `{ email }` — envia link (Brevo); requer `SUPABASE_SERVICE_ROLE_KEY` |
| POST | `/api/auth/complete-password-reset` | Corpo: `{ token, password }` — conclui reset; envia e-mail de confirmação |

## Convites e cadastro empresa (Bearer quando assinalado)

| Método | Caminho | Descrição |
|--------|---------|-----------|
| GET | `/api/invites/preview?token=` | Público: valida convite |
| POST | `/api/invites/convidar` | Gestor/CS/admin: `{ email }` — envia convite cliente gestão |
| POST | `/api/invites/accept` | Bearer: `{ token }` — aceita convite após signup |
| POST | `/api/invites/welcome` | Bearer: envia boas-vindas uma vez |
| POST | `/api/registration/check-cnpj` | Bearer **admin**: `{ cnpj }` — `available` para dedupe |
| POST | `/api/registration/attach-organizacao` | Bearer **admin**: `{ cnpj, nomeFantasia, usuarioId }` — associa organização ao perfil `usuarioId` |

Variáveis de ambiente: `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `PUBLIC_APP_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

## Carteira / gestor

| Método | Caminho | Descrição |
|--------|---------|-----------|
| GET/POST | `/api/programas-cliente` | Estado dos programas por cliente |
| GET | `/api/gestor/clientes` | Lista de clientes (Bearer) |
| POST | `/api/gestor/vincular` | Vincular cliente |
| POST | `/api/gestor/desvincular/:id` | Desvincular |
| … | `/api/perfis`, `/api/demandas` | Ver código em `src/routes/` |

## Conteúdo dinâmico (Supabase)

Dados servidos a partir das tabelas `bonus_offers`, `calendar_prices`, `demo_flights` (ver migration `supabase/migrations/20260406120000_bonus_calendar_demo_flights.sql`).

| Método | Caminho | Query | Resposta |
|--------|---------|-------|----------|
| GET | `/api/bonus-offers` | `program?` (opcional) | `BonusOffer[]` (camelCase) |
| GET | `/api/calendar-prices` | `origin`, `destination`, `mode` (`money`\|`points`), `month` (`YYYY-MM`) | `Record<day, number>` |
| GET | `/api/demo-flights` | `destination?` (IATA) | `DemoFlight[]` |

### Tipos TypeScript

- **Manager:** `@gest/core` — `contracts.ts` (`BonusOffer`, `DemoFlight`, `CalendarPricesParams`, …).
- **Admin manager-app:** `@gest-miles/shared` — mesmo contrato em `packages/shared/src/contracts.ts`.
- **Usuario:** `src/lib/api-contracts.ts` (espelho, sem pacote npm partilhado).

### Calendário sem linha em `calendar_prices`

O BFF devolve **estimativa determinística** (mesmo algoritmo legado) apenas quando não existe linha na tabela para a rota/mês/modo. Isto não substitui tarifas reais de companhias.

### CORS

`cors({ origin: true, credentials: true })` no `index.js` — ajuste origens em produção se necessário.
