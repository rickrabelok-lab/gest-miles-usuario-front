# Remoção do menu lateral (hambúrguer) — design

**Data:** 2026-07-21 · **Escopo:** front-only (sem migration, sem backend) · **Decisões do owner nesta sessão.**

## Contexto

O menu lateral (Sheet aberto pelo hambúrguer no `DashboardHeader`) duplica quase toda a navegação:
"Saiba Mais" inteiro já existe no Perfil (seção Suporte), "Sair" existe no Perfil e no dropdown do
avatar, "Privacidade" existe no Perfil. O owner decidiu que o menu **deixa de existir** — o app fica
só com bottom tabs + Perfil como hub (padrão Nubank).

Nota: o item paralelo da sessão (banner de cookies tampado pela barra de navegação Android) **não
gera mudança** — a foto era de build anterior ao fix `f72d243` (PR #103); o `CookieNotice` já usa
`--gm-safe-bottom`.

## Decisões (owner)

| Item do drawer | Destino |
|---|---|
| Registrar Emissão | **Morre pro cliente** — rota, página e lib saem do app |
| Compra de Milhas | Re-aloja: **CTA na visão Programas** da Home (`/?view=programas`) |
| Radar de Oportunidades | Re-aloja: **card de entrada na tela de Alertas** (`VencimentosPage`) |
| Minha Economia | Re-aloja: **botão "Relatório completo" na aba Economia** da Home, ao lado do "Baixar PDF" |
| Adicionar Alerta | Já tem entrada na tela de Vencimentos — nada a fazer |
| Saiba Mais (4 itens) | Já existem no Perfil — nada a fazer |
| Privacidade | Já existe no Perfil — nada a fazer |
| Termos de Uso | **Nova linha no Perfil** (seção Suporte) |
| Cookies | Sem linha nova — acessível via página de Privacidade e aviso de cookies |
| Baixar meus dados (export LGPD) | **Migra pro Perfil** (seção Suporte), mesmo comportamento ("Gerando…" + toasts) |
| Sair | Já existe no Perfil e no avatar — nada a fazer |

## Mudanças por arquivo

### `src/components/DashboardHeader.tsx`
- Remove o botão hambúrguer e todo o `Sheet` (drawer), incluindo o ramo deslogado ("Entrar ou criar conta").
- Remove `handleExportData`/`isExporting` (migram pro Perfil) e imports que ficarem órfãos
  (`Sheet*`, `GestMilesLogo`, ícones do drawer, `gatherUserData`/`deliverJson`, `isNativePlatform`, `toast`).
- Ficam: logo/wordmark, `NotificationsDropdown`, avatar dropdown (Meu perfil, Planos, Sair) e o banner de bônus.

### Remoção do Registrar Emissão
- `src/App.tsx`: sai a rota `/registrar-emissao` e o lazy import.
- `src/components/BottomNav.tsx`: sai o match `pathname === "/registrar-emissao"` da aba Passagens.
- Deletar `src/pages/RegistrarEmissaoPage.tsx` e `src/lib/registrar-emissao.ts` (+ testes associados, se existirem).
- `GESTMILES_EMISSION_ENABLED` (usado pelo `PurchaseOptionsScreen`) **não muda**.

### `src/pages/PerfilPage.tsx`
- Seção Suporte ganha, após "Privacidade e LGPD":
  - "Termos de Uso" → `/termos`;
  - "Baixar meus dados" → export LGPD (handler migrado do header: `gatherUserData` + `deliverJson`,
    estado "Gerando…", toasts de sucesso/erro, mensagem nativa vs web via `isNativePlatform`).

### `src/pages/Index.tsx` (Home)
- **Aba Economia**: botão "Relatório completo" → `/minha-economia`, no mesmo grupo do "Baixar PDF"
  (mesmo estilo pill).
- **Visão Programas** (`/?view=programas`): CTA "Simular compra de milhas" → `/simular-compra-milhas`,
  posicionado junto à lista de programas (posição exata definida no plano, seguindo o layout atual).

### `src/pages/VencimentosPage.tsx` (aba Alertas)
- Card compacto de entrada "Radar de Oportunidades" → `/radar-oportunidades` (ícone + texto + chevron),
  no topo da tela. O `BottomNav` já trata `/radar-oportunidades` como aba Alertas — navegação coerente
  sem mudança.

## Testes
- Atualizar testes que referenciem o drawer/rota removida (DashboardHeader, BottomNav, App, se houver).
- Novos asserts baratos: linhas "Termos de Uso" e "Baixar meus dados" no Perfil (export com service mockado),
  CTA "Relatório completo" na aba Economia, CTA de compra na visão Programas, card do Radar em Vencimentos.
- Gates de saída: `npx tsc -b` + `npm test` + `npm run build`.

## Fora de escopo / follow-ups
- **Sync manager**: pela regra do owner, a cópia forkada das telas de cliente no manager recebe a mesma
  mudança em PR separado no repo do manager, depois deste.
- Backend/RPCs de emissão não mudam (só o front do cliente perde a tela).
