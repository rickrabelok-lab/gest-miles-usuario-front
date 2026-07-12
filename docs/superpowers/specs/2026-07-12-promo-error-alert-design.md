# Design: alerta de falha em tempo real do radar de promoções (`gm-promo-error-alert`)

**Data:** 2026-07-12
**Status:** Aprovado pelo owner (brainstorm); ops/monitoramento, follow-up do review do `gm-promo-sink`

---

## Problema

O refactor DRY concentrou o downstream dos 2 pipelines de promoção no sub-workflow `gm-promo-sink`. O review whole-branch (opus) apontou: o sink virou **ponto único não-monitorado** — como o dedup (`*-unseen`) fica upstream, um sink quebrado ou desativado marca itens como `seen` sem inserir → **perda silenciosa em AMBOS** (RSS + Esfera). Hoje **nenhum** dos 4 workflows de promo tem `settings.errorWorkflow` → se qualquer um falha, ninguém é avisado.

**Fato verificado (teste descartável):** quando o sink está desativado e um produtor o chama em runtime, o produtor **erra** com `"Workflow is not active and cannot be executed"` (status `error`). Não há caso de sucesso-silencioso. Logo um Error Trigger cobre os 3 cenários (falha do sink, falha do produtor, sink-desativado) — **sem precisar de polling de estado**.

## Solução

Um workflow n8n `gm-promo-error-alert` com nó `errorTrigger`, apontado por `settings.errorWorkflow` nos 4 workflows de promo. Quando qualquer um falha, o n8n executa o alerta automaticamente, que manda uma mensagem no Grupo Teste (WhatsApp/Evolution) com workflow, nó, erro e id de execução.

**Anti-spam (decisão do owner): simples — alerta toda falha, sem estado.** Falhas de promo são raras (pipelines estáveis); uma queda sustentada nagging garante que o owner percebe. Se ficar barulhento, throttle vira follow-up.

---

## Escopo

### Novo workflow: `gm-promo-error-alert` (ativo)

Campos do errorTrigger nesta instância (confirmados no `[RRV] 00 Error Handler`): `$json.workflow.name`, `$json.execution.lastNodeExecuted`, `$json.execution.error.message`, `$json.execution.id`, `$json.execution.url`.

| Nó | Tipo | O que faz |
|----|------|-----------|
| `gpe-trigger` | `errorTrigger` | dispara quando um workflow que aponta pra este falha |
| `gpe-msg` | `code` (runOnceForEachItem) | monta o texto do alerta a partir dos campos acima |
| `gpe-tenant` | `postgres` | `select grupo_interno_jid, instance from agent_tenants where id=3` |
| `gpe-notify` | `httpRequest` POST | Evolution `sendText` → grupo interno |

Credenciais por id: `CRED_POSTGRES_AGENTE` (`Ucn1qbvcmYC4XHpa`), `CRED_EVOLUTION_HEADER` (`qzR4JN04NUY3GPeQ`).

**Texto do alerta (WhatsApp — markdown do WhatsApp, `*bold*`):**
```
🚨 *Falha no radar de promoções*
Workflow: <workflow.name>
Nó: <execution.lastNodeExecuted>
Erro: <execution.error.message>
Execução: <execution.id>
```

O `gpe-msg` também carrega `grupo`/`instance`? Não — segue o padrão do housekeeping: `gpe-msg` produz `{text}`, `gpe-tenant` produz `{grupo_interno_jid, instance}`, e `gpe-notify` referencia `$('gpe-msg').first().json.text` (crossing 1:1 seguro, single-item — o errorTrigger emite 1 item por falha).

### Fiação: `settings.errorWorkflow` nos 4 workflows de promo

Setar `errorWorkflow = <id do gm-promo-error-alert>` em: `gm-promo-ingest` (`kf33adWMPKMAEv4C`), `gm-promo-esfera` (`p2wC2fzENv1OpHau`), `gm-promo-sink` (`PR1iXHITz9GcjsYN`), `gm-promo-housekeeping` (`R7JMfs3oeJmiJp5c`). O `gm-promo-error-alert` **não** aponta pra si mesmo (evita loop).

---

## Riscos & mitigação

- **PUT desativa:** setar `errorWorkflow` exige PUT em cada workflow (via API, preservando `nodes`/`connections`) → desativa → re-ativar. Gap de segundos; o sink segue publicado. No sink, o gap pode fazer um run concorrente de produtor errar (janela ~2s) — risco mínimo.
- **Alerta do alerta:** se o próprio `gm-promo-error-alert` falhar (ex.: Evolution fora), não há alerta-do-alerta (aceitável, YAGNI).
- **Spam em queda longa:** aceito por decisão do owner (nag = feature).

## Rollout (ordem)

1. Push do `gm-promo-error-alert` (create) → captura id → **ativar** (errorTrigger exige workflow ativo).
2. Setar `errorWorkflow=<id>` nos 4 workflows (GET → merge no settings → PUT → re-ativar cada). Confirmar `active:true` + `settings.errorWorkflow` em cada.
3. **Smoke:** forçar uma falha controlada e confirmar 1 alerta no Grupo Teste. Método: clonar um produtor apontando pro sink **desativado momentaneamente** dispara o erro real — mas mexer no sink vivo é arriscado. Método mais limpo: workflow temp `webhook → node que lança erro`, com `errorWorkflow=<id>`, ativar, disparar → confirma alerta + execução do `gm-promo-error-alert` → deletar temp.
4. Commit + PR + memória.

## Critérios de sucesso

- `gm-promo-error-alert` ativo; os 4 workflows com `errorWorkflow` setado (confirmado via GET).
- Smoke: uma falha forçada gera **exatamente 1** alerta no Grupo Teste com workflow/nó/erro corretos.
- Cleanup: nenhum workflow temp sobra; os 4 de promo seguem ativos.

## Fora de escopo

- Throttle/dedup (follow-up se barulhento).
- Log de erros em tabela (o RRV faz; aqui YAGNI).
- Alerta de "fonte silenciosa"/"fila pending" — já coberto pelo `gm-promo-housekeeping`.
