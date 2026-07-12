# Design: Onboarding de grupos WhatsApp (descoberta + auto-mapeamento)

**Data:** 2026-07-12
**Status:** Aprovado em conceito pelo owner; aguardando revisão final do spec
**Autor:** Rick Rabelok + Claude
**Contexto:** desbloqueia o alcance do canal DIRETO da Fase 3-B (hoje só ~2 clientes têm grupo mapeado).

---

## Visão Geral

Popular `agent_grupos` + `agent_vinculos` (tabelas da Fase C) mapeando cada cliente ao seu grupo de WhatsApp, pra que o alerta proativo direto (3-B) alcance os ~444 clientes — hoje inerte por falta de mapeamento.

**Realidade (verificada 2026-07-12 + owner):**
- A equipe **já opera 1 grupo de WhatsApp por cliente**, e esses grupos **contêm o nome do cliente** no título.
- O **número do bot (`5527999819535`) NÃO está** nesses grupos.
- **444 clientes** na equipe piloto (`fd6f3039`), **nomes 100% únicos** (0 duplicados) → match por nome é inequívoco.
- **Telefone é esparso:** só 44/444 têm `perfis.numero_telefone` (formato nacional, sem "55") → telefone não serve de mecanismo principal.

**Restrição dura do WhatsApp:** o bot **não se adiciona sozinho** a um grupo — alguém de dentro precisa adicionar o número (ou mandar link de convite). Logo, "colocar o bot nos grupos" é **trabalho operacional da equipe**; o sistema faz a parte automatizável: **descobrir + mapear** os grupos assim que o bot entra.

---

## Decisões registradas (owner, 2026-07-12)

1. **Mecanismo:** descobrir os grupos do bot via Evolution → auto-mapear por **nome do cliente contido no nome do grupo** (match único) → reportar os incertos pra revisão manual. Reusa `agent_grupos`/`agent_vinculos`.
2. **Sequência:** construir a máquina AGORA (pronta pro piloto); a equipe adiciona o bot num lote piloto (~10 grupos) e aí valida/afina com nomes reais.
3. **Revisão dos incertos:** manual pela lista reportada (MVP). UI dedicada = follow-up.

---

## Escopo

**Dentro:** máquina de descoberta + auto-mapeamento (n8n + rota de backend testável) + relatório dos incertos no grupo interno. Sob demanda (a equipe roda depois de adicionar um lote) + cron diário opcional.

**Fora (follow-ups):** UI de revisão no manager/admin; automatizar a entrada do bot (link de convite via Evolution `joinGroup`); backfill de `numero_telefone`; multi-tenant além do piloto.

---

## Arquitetura

```
n8n gm-grupo-onboarding (Webhook sob demanda + cron diário opcional)
  1. Evolution GET /group/fetchAllGroups/{instance}  (grupos que o bot está)
  2. HTTP POST -> BFF /api/agent/group-onboarding  { tenant_id, groups:[{jid,nome,size}] }  (x-api-key)
        BFF (service role):
          - upsert cada grupo em agent_grupos (grupo_jid, tenant_id, descricao=nome)
          - match testável: nome do cliente (da equipe do tenant) CONTIDO no nome do grupo (normalizado)
          - match único -> insert agent_vinculos (cliente_id, grupo_id, tipo='cliente')
          - 0 ou >1 -> não mapeia; entra na lista de revisão
          - retorna { descobertos, auto_mapeados, ja_mapeados, revisar:[{grupo, candidatos}] }
  3. Code compõe o relatório -> Evolution send pro grupo_interno_jid do tenant
```

O **core (matching)** vive na rota de backend = testável por Vitest (padrão da casa). O n8n só orquestra (Evolution + envio).

### Backend — `POST /api/agent/group-onboarding` (novo)

- Auth: `x-api-key` = `AGENT_API_KEY` (mesmo padrão do resumo de demandas / promo-message).
- Input: `{ tenant_id, groups: [{ jid, nome, size? }] }`.
- Passos (service role, bypassa RLS):
  1. Lê a `equipe_id` do tenant (`agent_tenants`).
  2. Upsert cada grupo em `agent_grupos` (por `grupo_jid`; `descricao=nome`, `ativo=true`).
  3. Carrega os clientes da equipe (`perfis`: `usuario_id, nome, nome_completo`).
  4. **Matching (lib testável `groupClientMatch.js`):** normaliza (minúsculo, sem acento via `translate`-like em JS, colapsa espaços) o nome do grupo e o nome de cada cliente; um cliente casa se o nome dele aparece **como sequência de palavras** dentro do nome do grupo (padding com espaço pra respeitar borda de palavra). Retorna os candidatos por grupo.
  5. Pra cada grupo sem vínculo de cliente: **exatamente 1 candidato** → insert `agent_vinculos` (`cliente_id`, `grupo_id`, `tipo='cliente'`, `nome_exibicao=nome`, `participante_jid`=jid derivado do `numero_telefone` quando conhecido, senão sentinela). **0 ou >1** → não mapeia; vai pra `revisar`.
  6. Retorna o relatório.
- **Idempotente:** re-rodar não duplica (grupo por `grupo_jid`; vínculo só se ainda não existe).

### `participante_jid` (NOT NULL na Fase C)

O envio da 3-B usa o **jid do GRUPO**, não do participante — então `participante_jid` não é usado no fluxo. Preencho com o jid derivado de `numero_telefone` (`55`+DDD+número+`@s.whatsapp.net`) quando o cliente tem telefone (44 casos), senão uma **sentinela** (`onboarding-pending`). **Constraint confirmada:** `UNIQUE (grupo_id, participante_jid)` — como é **1 vínculo de cliente por grupo**, a sentinela repetida entre grupos diferentes não colide (o `grupo_id` difere). **Sem migration.**

### n8n — `gm-grupo-onboarding` (novo)

- Trigger: **Webhook** (sob demanda) + (opcional) Schedule diário.
- Evolution `fetchAllGroups` (credencial `CRED_EVOLUTION_HEADER`) → lista de grupos do bot.
- HTTP POST pro BFF (`AGENT_API_KEY`) → relatório.
- Code compõe a mensagem + Evolution send pro `grupo_interno_jid`.

---

## Matching — regras

- **Normalização:** minúsculo, sem acento, `[^a-z0-9 ]`→espaço, colapsa espaços, trim. Aplicada aos dois lados.
- **Match:** ` ${nome_cliente_norm} ` é substring de ` ${nome_grupo_norm} ` (padding pra borda de palavra). Ex.: "Fulano Silva" casa "Fulano Silva - GestMiles".
- **Auto-mapeia** só com **1** candidato. **>1** (nome de um cliente contém o de outro / grupo cita 2) ou **0** → revisão.
- Nomes únicos (444/444) tornam o match único confiável. Nomes de 1 palavra são o risco de falso-match (viram revisão por segurança se ambíguos).

## Erros e resiliência

- Evolution fora / sessão caída → job falha graciosamente; alerta no grupo interno (receita Fase C). Re-rodar é seguro (idempotente).
- Grupo sem match → fica em `agent_grupos` sem vínculo, listado pra revisão; não quebra nada.
- Nenhum grupo novo → relatório "nada novo" (ou noop).

## Testes

- **Vitest (backend):** `groupClientMatch` — normalização (acentos, espaços, pontuação); match único ("Fulano Silva" em "Fulano Silva - Gestão"); ambiguidade (0 e >1 candidatos); borda de palavra (não casar "Ana" dentro de "Analeide"). Rota `group-onboarding` — upsert idempotente, auto-map só de único, shape do relatório (mock do supabaseService).
- **E2E controlado:** com o bot num lote piloto real → rodar o job → conferir agent_grupos/vinculos populados + relatório no grupo interno. (Sem staging; validação com dado real do piloto.)
- Gates: `npx tsc -b` + `npm test` + `npm run build` (backend tem suíte própria).

## Custos

Marginal ~zero (Evolution + backend já pagos). Custo real: o trabalho **operacional da equipe** de adicionar o bot aos 444 grupos (incremental).

## Fora de escopo (follow-ups)

- UI de revisão (manager/admin) dos incertos.
- Automatizar entrada do bot via link de convite (`joinGroup`).
- Backfill de `numero_telefone`.
- Limite de frequência / notificar o cliente ao entrar no grupo.
