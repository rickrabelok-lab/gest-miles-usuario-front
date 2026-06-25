# Design — "Baixar meus dados" (export LGPD, front-only, JSON)

**Data:** 2026-06-25
**Repo:** `gest-miles-usuario-front` (app cliente)
**Status:** aprovado no brainstorming, pronto pro plano de implementação

## Objetivo

Materializar in-app os direitos de **acesso** e **portabilidade** da LGPD (art. 18),
hoje exercidos só por e-mail (`privacidade@gestmiles.com.br`, ver Política de
Privacidade §7). O usuário (`cliente` / `cliente_gestao`) clica em "Baixar meus
dados" e recebe um arquivo **JSON** com todos os seus dados pessoais legíveis pelo
navegador.

## Decisões fechadas (brainstorming)

1. **Formato:** JSON só (formato de portabilidade da LGPD; legível por máquina e
   por humano; sem libs novas).
2. **Arquitetura:** front-only. Um service consulta as tabelas do próprio usuário
   via Supabase client (RLS já escopa a ele), monta o JSON e dispara o download
   (Blob). Zero backend novo, zero migration, zero dependência de deploy do BFF.
   Alinhado com a regra Zero Trust "ler os próprios dados = Supabase client direto,
   protegido por RLS".
3. **Credenciais de programa:** excluídas por construção (`cliente_programa_acessos`
   é cifrada e **não-legível pelo browser** — `revoke all` pra `authenticated`).
   O export registra uma nota explicando.
4. **Ponto de entrada:** item "Baixar meus dados" na seção **Legal** do menu
   (`DashboardHeader`), ao lado de Privacidade/Termos/Cookies.

## Componentes (3 peças isoladas)

### 1. `src/services/dataExportService.ts` (novo)

Núcleo testável, sem React.

- `gatherUserData(userId: string, account: AccountInfo, client = supabase): Promise<DataExportBundle>`
  - Consulta cada fonte (abaixo) via `client`, com **try/catch por fonte**.
  - `client` injetável → testável no Vitest com supabase mockado.
  - Nunca lança por causa de uma fonte: erro de uma tabela vira entrada em
    `bundle.observacoes` e o resto segue.
- `downloadJson(bundle: DataExportBundle): void`
  - `JSON.stringify(bundle, null, 2)` → `Blob` (`application/json`) →
    `URL.createObjectURL` → `<a download>` clicado → `revokeObjectURL`.
  - Nome do arquivo: `gest-miles-meus-dados-AAAA-MM-DD.json`.

`AccountInfo` = dados da sessão já em mãos (`{ id, email, criadoEm }`), passados
pelo handler — o service não acessa `auth` direto (mantém a fronteira limpa e
testável).

### 2. Handler no `DashboardHeader` (`src/components/DashboardHeader.tsx`)

Função async `handleExportData()`:
1. Guarda: sem `user` → não faz nada (o item nem aparece sem sessão).
2. Estado `isExporting` (desabilita o item, evita clique duplo).
3. Toast sonner de loading → `gatherUserData(user.id, { id, email, criadoEm }, )`
   → `downloadJson(bundle)` → toast de sucesso.
4. `catch` → toast de erro genérico (sem vazar `error.message`).

### 3. Item de menu (seção Legal do `DashboardHeader`)

`<button>` no mesmo padrão visual dos vizinhos (Privacidade/Termos/Cookies), ícone
`Download` (lucide), texto "Baixar meus dados". Dispara `handleExportData` (não
navega). Mostra "Gerando…" enquanto `isExporting`.

## Fontes de dados (todas RLS, do próprio usuário)

Owner-columns confirmadas lendo os hooks existentes:

| Chave no JSON     | Tabela / origem            | Filtro de dono            |
|-------------------|----------------------------|---------------------------|
| `conta`           | sessão (AuthContext)       | (id/email/criado_em)      |
| `perfil`          | `perfis`                   | `usuario_id`              |
| `programas`       | `programas_cliente`        | `cliente_id`              |
| `demandas`        | `demandas_cliente`         | `cliente_id`              |
| `preferencias`    | `preferencias_usuario`     | `usuario_id`              |
| `timeline`        | `timeline_eventos`         | `cliente_id`              |
| `nps`             | `nps_convites` (+ avaliações se RLS permitir) | `cliente_id` |
| `csat`            | tabela CSAT do usuário     | `cliente_id` (confirmar)  |
| `indicacoes`      | `indicacoes` / `indicacao_codigos` | dono = indicador (confirmar coluna) |
| `mensagensContato`| `mensagens_contato`        | dono = remetente (confirmar coluna) |
| `alertas`         | `alertas_sistema`          | dono + `tipo='CLIENT_CUSTOM'` (confirmar) |

> As colunas marcadas "(confirmar)" são confirmadas na implementação (lendo a
> migration/RLS ou via MCP read-only). Se uma fonte não for legível pelo usuário
> (sem policy), o **design de robustez já cobre**: cai em `observacoes` e o export
> não quebra. Nenhuma fonte é obrigatória.

`perfil`: incluir a linha de `perfis` com os campos pessoais (nome, cpf, rg,
passaporte, nascimento, telefone, slug, preferências) **e** o bloco
`configuracao_tema.clientePerfil` (onde moram endereço/família). NÃO incluir
campos de controle interno que não são dado pessoal do usuário no sentido de
portabilidade além do necessário; `role`/`equipe_id` podem entrar (são do próprio
registro do usuário) — decisão de baixo impacto, incluir por simplicidade.

## O que NÃO entra (registrado em `observacoes` no próprio JSON)

- **Credenciais de programas** (`cliente_programa_acessos`): cifradas, só servidor,
  não-legíveis pelo browser. Nota: "Por segurança, logins/senhas de programas ficam
  cifrados no servidor e não são incluídos neste arquivo; você os gerencia no app."
- **Notas internas de CS / audit logs / scores de gestor**: gerados pela equipe,
  não são portabilidade de dado pessoal do usuário. Fora de escopo.

## Robustez (princípio central)

`gatherUserData` **sempre produz um arquivo**. Cada fonte é consultada de forma
independente; erro (RLS denied, tabela ausente, rede) é capturado, registrado em
`bundle.observacoes` (ex.: `"timeline: não foi possível ler"`), e a montagem
continua. Trata 401/403 graciosamente (Zero Trust). O usuário nunca fica preso
numa tela de erro por uma única fonte indisponível.

## Shape do JSON (esboço)

```jsonc
{
  "exportadoEm": "2026-06-25T12:00:00.000Z",
  "aplicacao": "Gest Miles — app do cliente",
  "conta": { "id": "...", "email": "...", "criadoEm": "..." },
  "perfil": { /* linha de perfis + configuracao_tema.clientePerfil */ },
  "programas": [ /* programas_cliente */ ],
  "demandas": [ /* demandas_cliente */ ],
  "preferencias": { /* preferencias_usuario.preferencias */ },
  "timeline": [ /* timeline_eventos */ ],
  "nps": [ /* ... */ ],
  "csat": [ /* ... */ ],
  "indicacoes": [ /* ... */ ],
  "mensagensContato": [ /* ... */ ],
  "alertas": [ /* ... */ ],
  "observacoes": [
    "Credenciais de programas não são incluídas por segurança (cifradas no servidor).",
    "..." /* + qualquer fonte que falhou */
  ]
}
```

## Tratamento de erro / estados

- Item desabilitado enquanto `isExporting` (sem clique duplo).
- Sucesso: toast "Pronto! Seu arquivo foi baixado.".
- Falha geral (ex.: `downloadJson` falha): toast de erro genérico, sem
  `error.message` cru.
- Falha por fonte: silenciosa pro usuário (vai pra `observacoes` no arquivo).

## Testes (Vitest — rede de segurança principal)

`src/services/dataExportService.test.ts`:
1. Bundle tem todas as chaves esperadas + `exportadoEm` + `conta`.
2. Cada fonte é consultada com a tabela e o owner-column corretos (assert nos
   mocks de `.from().select().eq()`).
3. Uma fonte que rejeita (mock `error`) → entra em `observacoes`, **não lança**, e
   as outras fontes seguem presentes.
4. **Nunca** consulta `cliente_programa_acessos` (assert que `from` não foi chamado
   com esse nome).
5. `observacoes` sempre contém a nota fixa das credenciais.

(`downloadJson` é fino e dependente de DOM/Blob; testar só se sair barato — senão,
deixar coberto pelo smoke manual.)

## Fora de escopo (YAGNI / deferido)

- PDF (decidido JSON só).
- Rota de backend (decidido front-only).
- **Delete de conta** (cascade no banco compartilhado multi-tenant exige design
  próprio — deferido, ver memória).
- Replicação no fork do manager: é ação self-service do **cliente final**; staff
  não usa. **Não replicar** no manager.

## Gate antes de "pronto"

`npx tsc -b` + `npm test` + `npm run build`. Validação runtime: smoke manual (login
cliente → menu Legal → Baixar meus dados → abrir o JSON baixado).

## Referências

- `src/components/DashboardHeader.tsx` (seção Legal, linhas ~342-378)
- `src/pages/legal/PrivacidadePage.tsx` §7 (direitos LGPD)
- `src/lib/supabase.ts` (client), `src/contexts/AuthContext.tsx` (sessão)
- Hooks com owner-columns: `useProgramasCliente`, `usePreferenciasSugestoes`,
  `useClientTimeline`, `useNpsCliente`, `useGestor` (demandas_cliente)
