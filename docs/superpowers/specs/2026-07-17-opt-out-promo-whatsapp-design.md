# Opt-out de promoções no WhatsApp — Design

**Data:** 2026-07-17
**Status:** Aprovado (aguardando review da spec antes do plano)
**Escopo:** front (`gest-miles-usuario-front`) + backend BFF (Express). Sem migration.

## Contexto

O radar de promoções (fase 3-B, já no ar) manda promoções de transferência aprovadas
pro WhatsApp do cliente — direto no grupo dele (via `agent_vinculos`/`agent_grupos`) ou,
sem grupo, num digest interno pra equipe. Dois workflows n8n consomem isso:
`gm-promo-personalizado` (tempo real, disparado por pg trigger) e `gm-promo-digest-interno`
(cron 09:00).

Hoje o opt-out **existe no pipeline mas não tem UI**: ambos os workflows respeitam
`agent_preferencias(cliente_id, chave='promo_optout', valor='true')` via
`where not exists (...)`, mas o cliente não tem como ligar/desligar isso pelo app — só
mexendo direto no banco. Este design entrega o controle no app.

## Objetivo

Dar ao cliente `cliente_gestao` um controle self-service pra **desligar/religar** as
promoções que recebe no WhatsApp, respeitando Zero-Trust (segredo/tabela do bot nunca
tocam o browser) e sem mexer no schema do banco compartilhado.

## Não-objetivos (YAGNI)

- Outras notificações (só o toggle de promo WhatsApp agora; a tela ganha estrutura pra
  crescer, sem features especulativas).
- Controle por canal (direto vs digest) — o opt-out suprime os dois, como o pipeline já faz.
- Preferências de frequência/horário.
- Toggle pra `cliente` avulso (fora do fluxo do bot).

## Comportamento

- Tela nova **Notificações** (`/notificacoes`), acessível por uma linha na seção
  **Preferências** do perfil (ícone sino). **Visível só pra `role === 'cliente_gestao'`.**
- Um controle: toggle **"Promoções no WhatsApp"** + apoio ("Receba as melhores promoções
  direto no seu grupo").
- **Default = LIGADO** (recebe). Desligar = opt-out.
- Semântica no banco: opt-out ⟺ existe linha
  `agent_preferencias(cliente_id, chave='promo_optout', valor='true')`.
  - **Ligar** apaga a linha (ausência = recebe).
  - **Desligar** faz upsert com `valor='true'`.
  - Casa 1:1 com o `where not exists (... ap.valor = 'true')` que os workflows 3-B usam.
- **Sem migration** — só INSERT/DELETE numa tabela existente.

## Arquitetura

### Backend — `backend/src/routes/notifications.js` (montado em `/api/notifications`)

Espelha o padrão de `accountDeletion.js`: middleware **`requireUser`** (valida o token no
servidor e expõe `req.user`) + service role pra escrever a tabela bloqueada do bot.

- `GET /api/notifications/promo-whatsapp`
  - `requireUser` → service role lê `agent_preferencias` (cliente_id = `req.user.id`,
    chave = `promo_optout`).
  - Resposta: `{ enabled: boolean }`, onde `enabled = !(row?.valor === 'true')`.
- `PUT /api/notifications/promo-whatsapp` body `{ enabled: boolean }`
  - `requireUser` → service role:
    - `enabled === false` → upsert linha (cliente_id, chave='promo_optout', valor='true').
    - `enabled === true` → delete da linha (cliente_id, chave='promo_optout').
  - Resposta: `{ enabled }`.
  - Valida `enabled` como booleano; 400 se ausente/invalido.

**Zero-Trust:** `cliente_id` vem SEMPRE de `req.user.id` (token validado), NUNCA do body.
Qualquer usuário autenticado só altera o próprio opt-out. O gate por role é só UX.

**Upsert robusto:** a rota não assume constraint única em `(cliente_id, chave)`. Faz
select-then-update-or-insert (ou `onConflict` se a constraint existir — confirmar no banco
via SQL read-only na implementação; se não houver, usar select+branch). Como é service
role, o controle é total.

### Front

- `src/lib/notifications.ts` — funções puras de I/O:
  - `getPromoWhatsappPref(token): Promise<{ enabled: boolean }>` (GET via `apiFetch`).
  - `setPromoWhatsappPref(token, enabled): Promise<{ enabled: boolean }>` (PUT via `apiFetch`).
  - Token obtido pelo chamador via `supabase.auth.getSession()` (padrão `useAccountDeletion`).
- `src/hooks/useNotificationPrefs.ts` — estado + ações:
  `{ enabled, loading, saving, error, reload(), toggle(next) }`.
- `src/pages/NotificacoesPage.tsx` — a tela:
  - Header "Notificações" + `BottomNav`.
  - Card com Switch (shadcn/ui) "Promoções no WhatsApp" + descrição.
  - Estados de loading (skeleton), erro (mensagem + "Tentar de novo"), e `disabled` do
    Switch enquanto salva.
- `src/pages/PerfilPage.tsx` — nova `menuRow(Bell, "Notificações", () => navigate("/notificacoes"))`
  na seção **Preferências**, renderizada só se `role === 'cliente_gestao'`.
- `src/App.tsx` — rota `/notificacoes` dentro do `ClienteOnly` (RequireAuth + RequireClienteApp).

## Data flow

```
NotificacoesPage → useNotificationPrefs
  mount:  GET /api/notifications/promo-whatsapp → { enabled } → posiciona o Switch
  toggle: otimista (vira o Switch) → PUT { enabled } → confirma
          erro no PUT → reverte o Switch + toast
```

## Erro & estados

- **GET falha:** tela mostra "não foi possível carregar suas preferências" + "Tentar de novo";
  não renderiza o Switch em estado enganoso.
- **PUT falha:** reverte o Switch pro valor anterior + toast (sonner)
  "não foi possível salvar. Tente de novo."
- **401/403:** gracioso — toast neutro, sem vazar detalhe do backend.
- **Salvando:** Switch `disabled` (evita corrida de cliques).

## Testes

- **Front:**
  - `src/lib/notifications.test.ts` — mapeamento `enabled ↔ valor='true'`, path/verbo corretos,
    propagação de erro.
  - `src/pages/NotificacoesPage.test.tsx` — reflete estado carregado, chama setter ao togglar,
    reverte no erro, estado de loading/erro. Hook mockado; descrição PT-BR; `vi.clearAllMocks()`
    no `beforeEach`.
- **Backend:**
  - `backend/src/routes/notifications.test.js` espelhando `accountDeletion.test.js` (se houver
    mock de service role): GET/PUT, cliente_id derivado do token, 401 sem token, 400 body inválido.
    Se o mock não cobrir, smoke via curl com Bearer real na conta de teste.
- **Gates:** `npx tsc -b` + `npm test` + `npm run build` (+ testes do backend, se houver script).

## Segurança / banco / sync

- **Zero-Trust:** service role só no backend; `agent_preferencias` (infra do bot) segue
  fechada pro browser; `cliente_id` do token.
- **Banco compartilhado:** sem migration → sem coordenação com manager/admin. Baixíssimo risco.
- **Sync manager** ([[sync-user-app-changes-to-manager]]): confirmar se o `PerfilPage` do
  cliente é forkado no manager. **Follow-up, não bloqueia** — a tela é nova e o gate
  `cliente_gestao` provavelmente não se aplica no shell de staff. Registrar no corpo do PR.

## Riscos & mitigação

| Risco | Mitigação |
|-------|-----------|
| Constraint única em `(cliente_id, chave)` desconhecida | Rota faz select-then-update-or-insert; confirmar via SQL read-only na implementação |
| Cliente sem grupo vê toggle "morto" | Gate por role `cliente_gestao` (decisão do owner); só assessorados veem |
| `agent_preferencias` usada por outros produtos | Só tocamos linhas `chave='promo_optout'` do próprio cliente; nunca outras chaves |

## Arquivos (resumo)

**Novos:**
- `backend/src/routes/notifications.js`
- `backend/src/routes/notifications.test.js` (se houver setup)
- `src/lib/notifications.ts`
- `src/lib/notifications.test.ts`
- `src/hooks/useNotificationPrefs.ts`
- `src/pages/NotificacoesPage.tsx`
- `src/pages/NotificacoesPage.test.tsx`

**Alterados:**
- `backend/src/index.js` (montar a rota)
- `src/App.tsx` (rota `/notificacoes`)
- `src/pages/PerfilPage.tsx` (linha "Notificações" gated por role)
