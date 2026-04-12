# API Mile Manager Pro

> **Contrato atual (Seção D — bônus, calendário, voos demo):** use o documento canónico  
> **[`../backend/docs/api.md`](../backend/docs/api.md)** (`VITE_API_URL` no front).

Base URL: `VITE_API_URL` ou `API_URL` (ex: `http://localhost:3000`)

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

## Audit Logs

**Pré-requisito (base de dados):** a tabela `public.audit_logs` tem de existir no mesmo projeto Supabase usado pelo backend (`SUPABASE_URL`). Caso contrário a API devolve **503** com instruções.

**Escrita de eventos (app):** o helper `logAcao` nos fronts (`src/lib/audit.ts` no usuario-front; `apps/manager/src/lib/audit.ts` no manager) chama a RPC `audit_log_write` (além de `logs_acoes`). Ações que **não** passem por `logAcao` nem por triggers SQL em tabelas não aparecem em `audit_logs`.

**Forma mais rápida:** no Supabase → **SQL Editor** → colar e executar o ficheiro único `gest-miles-usuario-front/supabase/RUN_AUDIT_LOGS.sql` (inclui as duas partes na ordem certa).

**Alternativa (migrations incrementais):** por esta ordem em `gest-miles-usuario-front/supabase/migrations/`:

1. `20260416120000_audit_logs.sql`
2. `20260416130000_audit_logs_equipe_id.sql`  
   (Opcional: `20260416140000_rls_hardening_indexes.sql` se fizer parte do teu pipeline.)

### GET /api/audit-logs

Logs de auditoria com paginação e filtros. **Requer auth** e um dos papéis abaixo.

- **Admin master** (`role = admin`, `perfis.equipe_id` null): vê logs de todos os tenants.
- **Admin de equipe (modelo RLS)** (`role = admin`, `equipe_id` preenchido): só logs dessa equipe.
- **Admin de equipe (modelo manager)** (`role = admin_equipe`): logs das equipas em que o utilizador aparece em `equipe_admin` (`admin_equipe_id_1/2/3`, `ativo = true`), mais `perfis.equipe_id` se existir. Várias equipas → filtro `equipe_id IN (...)`.

**Query params:**

| Param    | Tipo   | Default | Descrição                              |
| -------- | ------ | ------- | -------------------------------------- |
| limit    | int    | 50      | Registos por página (max 200)          |
| offset   | int    | 0       | Cursor de paginação                    |
| tabela   | string | —       | Filtro exacto por tabela/recurso       |
| acao     | string | —       | Filtro exacto por tipo de ação         |
| user_id  | uuid   | —       | Filtro por autor da ação               |
| from     | string | —       | Data mínima ISO 8601                   |
| to       | string | —       | Data máxima ISO 8601                   |

**Exemplo de request (admin master):**

```
GET /api/audit-logs?limit=10&tabela=perfis&from=2026-04-01T00:00:00Z
Authorization: Bearer <access_token>
```

**Resposta 200:**

```json
{
  "logs": [
    {
      "id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      "user_id": "11111111-2222-3333-4444-555555555555",
      "user_name": "João Silva",
      "user_role": "gestor",
      "acao": "UPDATE",
      "tabela": "perfis",
      "antes": { "nome_completo": "João" },
      "depois": { "nome_completo": "João Silva" },
      "equipe_id": "ffffffff-0000-1111-2222-333333333333",
      "created_at": "2026-04-12T15:30:00.000Z"
    }
  ],
  "total": 42,
  "limit": 10,
  "offset": 0
}
```

**Exemplo de request (admin equipe — filtro automático):**

```
GET /api/audit-logs?limit=20&acao=DELETE
Authorization: Bearer <access_token_admin_equipe>
```

Resposta idêntica à anterior, mas `logs` só inclui registos cuja `equipe_id` coincida com a equipe do admin autenticado.

**Erros:**

| Status | Motivo                                |
| ------ | ------------------------------------- |
| 401    | Token ausente ou sessão inválida      |
| 403    | Utilizador não é admin                |
| 503    | Tabela `audit_logs` em falta no Supabase (aplicar migrations) |
| 500    | Erro interno (Supabase ou inesperado) |

### GET /api/audit-logs/tables

Lista distinta de tabelas presentes nos logs (útil para popular filtros na UI).

**Resposta 200:**

```json
{ "tables": ["perfis", "emissoes", "programas_cliente"] }
```

---

## Health

### GET /api/health
Health check. Não requer auth.

**Resposta:** `{ ok: true, timestamp }`
