# Redesign: Solicitar Cotação — Wizard Multi-etapas

**Data:** 2026-05-02
**Status:** Aprovado

---

## Visão geral

Substituir o modal scrollável atual de "Solicitar Cotação" por um wizard multi-etapas, mobile-first, com roteamento inteligente de gestor baseado na categoria selecionada pelo usuário.

---

## Fluxo: Emissão de passagem (3 etapas)

### Etapa 1 — Tipo
- Dois cards selecionáveis: **Emissão de passagem** e **Outra solicitação**
- Quando "Emissão" está selecionada:
  - Toggle **Nacional / Internacional** (escopo do voo)
  - Chip de gestor responsável (preenchido automaticamente com base no escopo)
- Botão: "Próximo: Rota →"

### Etapa 2 — Rota
- Campo **Origem** + botão swap ⇄ + campo **Destino** (textos livres — o gestor trata o código IATA)
- Dica inline: "Não sabe o código IATA? Pode digitar a cidade."
- DatePicker **Ida** (obrigatório) e **Volta** (opcional)
- Exibe duração calculada da viagem quando ambas as datas são preenchidas
- Botões: "← Voltar" e "Próximo: Extras →"

### Etapa 3 — Extras (todos opcionais)
- **Contador de passageiros** (− / número / +)
- **Grade de classe do voo**: Econômica, Premium Economy, Executiva, 1ª Classe
- **Toggles**:
  - Bagagem despachada
  - Seleção de assento
  - Datas flexíveis (±3 dias)
- Botões: "← Voltar" e "🚀 Enviar Solicitação" (verde)

---

## Fluxo: Outra solicitação (3 etapas)

### Etapa 1 — Tipo
- Mesmo card da tela de Emissão, com "Outra solicitação" selecionado
- Gestor Nacional aparece automaticamente no chip (sem toggle de escopo)
- Botão: "Próximo: Detalhar →"

### Etapa 2 — Categoria
Grid de categorias (2 colunas):

| Categoria | Ícone | Gestor responsável |
|---|---|---|
| Upgrade / Alteração de voo | ✈ | Depende do escopo (ver abaixo) |
| Aluguel de carro | 🚗 | Nacional (sempre) |
| Hotel | 🏨 | Nacional (sempre) |
| Seguro viagem | 🛡 | Nacional (sempre) |
| Transferência de pontos | 🔄 | Nacional (sempre) |
| Compra de produtos | 🛍 | Nacional (sempre) |
| Outros | 📋 | Nacional (sempre) |

**Regra especial — "Upgrade / Alteração de voo":**
- Ao selecionar esta categoria, exibe toggle **Nacional / Internacional**
- **Internacional** → Gestor Internacional
- **Nacional** → Gestor Nacional
- Para todas as demais categorias: sem toggle, vai direto para Gestor Nacional

### Etapa 3 — Detalhe
- Chip de gestor já definido (verde = Nacional, azul = Internacional)
- Campo de texto livre (Textarea) com contador de caracteres (max 500)
- Dica: "Quanto mais detalhes, mais rápido o gestor responde"
- Botões: "← Voltar" e "🚀 Enviar" (cor do botão segue o gestor: verde ou azul)

---

## Indicador de progresso

- Exibido no topo do wizard em todas as etapas
- Círculos com estado: `done` (verde ✓), `active` (roxo), `next` (cinza)
- Linha conectora muda de cinza para verde conforme avança
- Etapas variam conforme o fluxo:
  - Emissão: Tipo → Rota → Extras (3 etapas)
  - Outros sem voo: Tipo → Categoria → Detalhe (3 etapas)
  - *(Obs: a etapa 1 é compartilhada entre os dois fluxos)*

---

## Design visual

- **Design system:** Nubank/Fintech (roxo primário `#8A05BE`, gradiente `#8A05BE → #A020D0`)
- **Fonte:** DM Sans
- **Modal:** `Dialog` existente com `max-h-[85dvh]`, sem scroll — cada etapa ocupa o espaço disponível
- **Border-radius:** 14px nos cards internos, 12px nos campos, 20px nos botões principais
- **Botão enviar Emissão:** gradiente verde (`#22C55E → #16A34A`)
- **Botão enviar Outros → Internacional:** gradiente azul (`#1D4ED8 → #3B82F6`)
- **Botão enviar Outros → Nacional:** gradiente verde (`#16A34A → #22C55E`)
- **Sombra nos CTAs:** `box-shadow: 0 4px 16px rgba(cor, 0.35)`

---

## Componente

- **Localização:** extrair para `src/components/SolicitarCotacaoWizard.tsx`
- O componente recebe as props necessárias do `Index.tsx` (gestores, cliente ID, callback de submit)
- Estado interno do wizard (etapa atual, campos) gerenciado dentro do próprio componente
- Ao fechar o dialog, resetar para etapa 1

---

## Validações

| Campo | Regra |
|---|---|
| Origem | Obrigatório (emissão) |
| Destino | Obrigatório (emissão) |
| Data de ida | Obrigatório (emissão) |
| Gestor | Obrigatório — preenchido automaticamente, mas deve existir |
| Descrição (outros) | Obrigatório, mínimo 10 caracteres |
| Passageiros | Mínimo 1 (já garantido pelo contador) |
| Data de volta | Deve ser ≥ data de ida (quando preenchida) |

---

## O que NÃO muda

- Lógica de submit (`handleSubmitDemand`) e payload para o Supabase — permanecem iguais
- Tabela `demandas_cliente` — sem alteração de schema
- Regras de RLS e vinculação de gestor — sem alteração
