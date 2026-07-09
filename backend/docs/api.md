# API REST — BFF Gest Miles (`gest-miles-usuario-front/backend`) — rotas server-to-server

> Contrato completo das rotas de usuário (Bearer, front): [`../../docs/api.md`](../../docs/api.md).
> Este arquivo documenta especificamente rotas **server-to-server**, sem sessão de usuário,
> autenticadas por API key fixa em vez de `Authorization: Bearer`.
> Procurando a Seção D (bônus, calendário, voos demo)? Está documentada em [`docs/api.md`](../../docs/api.md) na raiz.

Base URL: `VITE_API_URL` no front / URL do deploy do backend (ex.: `http://localhost:3000`).

## Agente WhatsApp (n8n)

Consumidas pelos workflows n8n do agente WhatsApp (repo separado, `gestmiles-agente-whatsapp`),
nunca pelo browser. Auth por header fixo, comparado em tempo constante — ver
`backend/src/lib/agentAuth.js`.

### GET /api/agent/demandas-resumo

Resumo diário de demandas por equipe, usado pelo workflow `gm-resumo-demandas` (cron seg–sex
08:30) pra montar a mensagem no grupo interno de cada equipe.

**Auth:** header `x-api-key` deve ser igual à env `AGENT_API_KEY` do backend (comparação em
tempo constante). Sem sessão de usuário — usa Supabase **service role** internamente.

**Dados lidos:** `demandas_cliente` com status `pendente`/`em_andamento` (ativas) **ou**
criadas nas últimas 24h, `limit 500`, mais os `perfis` (nome + `equipe_id`) dos clientes
envolvidos.

**Resposta 200:**

```json
{
  "gerado_em": "2026-07-09T11:30:00.000Z",
  "equipes": [
    {
      "equipe_id": "ffffffff-0000-1111-2222-333333333333",
      "contagens": {
        "novas_24h": 3,
        "pendentes": 5,
        "em_andamento": 2,
        "paradas_3d": 1
      },
      "demandas": [
        {
          "id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          "cliente_nome": "João Silva",
          "tipo": "emissao",
          "status": "pendente",
          "resumo_curto": "GRU → MIA",
          "dias_parada": 4
        }
      ]
    }
  ]
}
```

`equipe_id` pode ser `null` (cliente sem `perfis.equipe_id`). `demandas` só lista as **ativas**
(pendente/em_andamento), ordenadas por `dias_parada` decrescente; `contagens` cobre o grupo
inteiro (inclui as criadas nas últimas 24h mesmo que já não estejam mais ativas).

**Erros:**

| Status | Motivo |
| ------ | ------ |
| 401 | `x-api-key` ausente ou não confere com `AGENT_API_KEY` |
| 503 | `AGENT_API_KEY` não configurada no servidor |
| 500 | Erro do Supabase ou inesperado |

**Variável de ambiente:** `AGENT_API_KEY` (`backend/.env.example`) — chave longa aleatória
(ex.: `openssl rand -hex 32`), cadastrada também como credencial no n8n
(`CRED_RESUMO_APIKEY`, header `x-api-key`). Nunca em `VITE_*`.
