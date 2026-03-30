# API Mile Manager Pro

Base URL: `API_URL` (ex: `http://localhost:3000`)

Todas as rotas protegidas exigem header: `Authorization: Bearer <access_token>`

---

## Auth

### POST /api/auth/signup
Cadastro com email e senha.

**Body:**
```json
{ "email": "user@example.com", "password": "senha123" }
```

**Resposta:** `{ user, session }`

---

### POST /api/auth/login
Login com email e senha.

**Body:**
```json
{ "email": "user@example.com", "password": "senha123" }
```

**Resposta:** `{ user, session }`

---

### POST /api/auth/magic-link
Envia link mágico por email.

**Body:**
```json
{ "email": "user@example.com", "redirectTo": "https://..." }
```

**Resposta:** `{ ok: true }`

---

### GET /api/auth/session
Retorna sessão atual. Requer Bearer token.

**Resposta:** `{ session, user }`

---

### GET /api/auth/user
Retorna usuário atual. Requer Bearer token.

**Resposta:** `{ user }`

---

## Programas Cliente

### GET /api/programas-cliente?clientId=uuid
Lista programas do cliente.

**Parâmetros:** `clientId` (obrigatório)

**Resposta:** Array de `ProgramaClienteRow`

---

### POST /api/programas-cliente
Upsert programa do cliente. Requer Bearer token.

**Body:** Objeto com `cliente_id`, `program_id`, `program_name`, `state`, etc.

**Resposta:** `{ ok: true }`

---

## Gestor

### GET /api/gestor/clientes
Lista IDs dos clientes vinculados ao gestor. Requer Bearer token.

**Resposta:** `string[]`

---

### POST /api/gestor/vincular
Vincula cliente ao gestor. Requer Bearer token.

**Body:** `{ "clienteId": "uuid" }`

**Resposta:** `{ ok: true }`

---

### DELETE /api/gestor/desvincular/:clienteId
Desvincula cliente. Requer Bearer token.

**Resposta:** `{ deleted: boolean }`

---

### GET /api/gestor/perfis?ids=id1,id2
Perfis dos clientes. Requer Bearer token.

**Parâmetros:** `ids` (vírgula separada)

**Resposta:** Array de perfis

---

### GET /api/gestor/programas?ids=id1,id2
Programas dos clientes. Requer Bearer token.

**Parâmetros:** `ids` (vírgula separada)

**Resposta:** Array de programas

---

### GET /api/gestor/demandas?ids=id1,id2
Demandas dos clientes. Requer Bearer token.

**Parâmetros:** `ids` (vírgula separada)

**Resposta:** Array de demandas

---

## Perfis

### GET /api/perfis/me
Perfil do usuário atual. Requer Bearer token.

**Resposta:** Objeto perfil ou null

---

### GET /api/perfis/role
Role do usuário. Requer Bearer token.

**Resposta:** `{ role: "user" | "gestor" | "admin" }`

---

### GET /api/perfis/:usuarioId
Perfil de um usuário. Requer Bearer token.

**Resposta:** Objeto perfil ou null

---

### PUT /api/perfis
Upsert perfil. Requer Bearer token.

**Body:** Objeto perfil

**Resposta:** `{ ok: true }`

---

## Demandas

### GET /api/demandas?clientIds=id1,id2
Lista demandas. Requer Bearer token.

**Parâmetros:** `clientIds` (vírgula separada)

**Resposta:** Array de demandas

---

### POST /api/demandas
Cria demanda. Requer Bearer token.

**Body:** `{ cliente_id?, tipo, status, payload }`

**Resposta:** Objeto demanda criada

---

### PATCH /api/demandas/:id
Atualiza demanda. Requer Bearer token.

**Body:** Campos a atualizar (ex: `{ status }`)

**Resposta:** Objeto demanda atualizada

---

## Bonus Offers (mock)

### GET /api/bonus-offers?program=Livelo
Lista ofertas de bônus. Não requer auth.

**Parâmetros:** `program` (opcional) - filtra por programa

**Resposta:** Array de ofertas

---

## Calendar Prices (mock)

### GET /api/calendar-prices?origin=SAO&destination=RIO&mode=money&month=2026-03
Preços do calendário. Não requer auth.

**Parâmetros:**
- `origin` - código origem (ex: SAO)
- `destination` - código destino (ex: RIO)
- `mode` - "money" ou "points"
- `month` - YYYY-MM

**Resposta:** `Record<day, price>` (ex: `{ "1": 450, "2": 520 }`)

---

## Health

### GET /api/health
Health check. Não requer auth.

**Resposta:** `{ ok: true, timestamp }`
