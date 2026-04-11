# Templates de e-mail transacional (Brevo)

Layout alinhado à referência de produto (cabeçalho + faixa de título + corpo + rodapé), com **paleta Gest Miles**:

| Zona | Estilo |
|------|--------|
| Fundo externo | `#F7F7F8` |
| Cartão | Borda `#e8e4ec`, cantos 20px, sombra roxa suave |
| **Cabeçalho** | Gradiente `135deg`: `#8A05BE` → `#9E2FD4` → `#B56CFF` |
| Marca no cabeçalho | «Gest Miles» branco, **Space Grotesk** |
| Faixa do título do e-mail | Pill `rgba(15,0,28,0.22)` + texto branco (ex.: «Recuperação de senha») |
| Corpo | Fundo branco, texto `#1f1f1f`, interlinha 1.6 |
| Destaques / marca no texto | `#8A05BE` |
| Notas secundárias | Roxo acinzentado `#7a5a9a` ou cinza `#6b6b6b` / `#9a9a9a` |
| **CTA** | Botão centrado, gradiente roxo, cantos 14px |
| **Rodapé** | Fundo `#faf8fc`, «Atenciosamente», **Equipa** cinza + **Gest Miles** roxo, aviso automático |

## Como usar na Brevo

1. **Transactional** → **Templates** → criar modelo e colar o HTML do ficheiro correspondente.
2. O backend envia HTML gerado em **`backend/src/lib/emailTemplates.js`** — estes ficheiros são referência para o painel Brevo.

## Ficheiros

| Ficheiro | Uso |
|----------|-----|
| `boas-vindas.html` | Primeiro acesso |
| `convite-cliente-gestao.html` | Convite gestor → cliente gestão |
| `convite-aceito-notificacao-gestor.html` | Convite aceite |
| `recuperacao-senha.html` | Reset de senha |
| `senha-alterada.html` | Confirmação pós-alteração |

## Variáveis sugeridas

`nome`, `nomeGestor`, `emailNovoUsuario`, `linkAceitar`, `linkReset`, `appUrl`, `primeiroNome` (recuperação de senha — primeiro nome; se vazio, ajustar a saudação no modelo), `loginUrl` e `dataHora` (senha alterada — URL de login e data/hora formatada em pt-BR)
