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
criadas nas últimas 24h, `limit 500`, mais os `perfis` (nome + `equipe_id`) e a carteira
`vw_carteira_dupla` (`dupla_id`/`dupla_nome`) dos clientes envolvidos.

**Resposta 200** (só contagens, agregadas por equipe e por dupla — sem lista de demandas
individuais, por decisão do owner 2026-07-09):

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
      "duplas": [
        {
          "dupla_id": 1,
          "dupla_nome": "Equipe 1 - Guilherme + Carla",
          "contagens": { "novas_24h": 2, "pendentes": 3, "em_andamento": 1, "paradas_3d": 1 }
        },
        {
          "dupla_id": null,
          "dupla_nome": null,
          "contagens": { "novas_24h": 1, "pendentes": 2, "em_andamento": 1, "paradas_3d": 0 }
        }
      ]
    }
  ]
}
```

`equipe_id` pode ser `null` (cliente sem `perfis.equipe_id`). `duplas` vem em ordem de nome,
com o bucket `dupla_id: null` ("sem dupla" — cliente fora da carteira) sempre por último;
`contagens` da equipe é o total (inclui as criadas nas últimas 24h mesmo que já não estejam
mais ativas).

**Erros:**

| Status | Motivo |
| ------ | ------ |
| 401 | `x-api-key` ausente ou não confere com `AGENT_API_KEY` |
| 503 | `AGENT_API_KEY` não configurada no servidor |
| 500 | Erro do Supabase ou inesperado |

**Variável de ambiente:** `AGENT_API_KEY` (`backend/.env.example`) — chave longa aleatória
(ex.: `openssl rand -hex 32`), cadastrada também como credencial no n8n
(`CRED_RESUMO_APIKEY`, header `x-api-key`). Nunca em `VITE_*`.
