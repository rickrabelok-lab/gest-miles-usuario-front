# Acessos de programas de milhas - desenho seguro

## Decisao de produto

Managers precisam acessar login e senha dos programas de milhas com facilidade. A solucao nao e remover a funcionalidade. A solucao e mudar o armazenamento e criar controle de acesso melhor.

## Problema atual

Hoje `ClientProfile.tsx` salva `acessos` dentro de `perfis.configuracao_tema.clientePerfil`.

Isso funciona para MVP, mas para producao tem 3 riscos:

1. `configuracao_tema` e um jsonb generico, dificil de auditar por campo.
2. Quem consegue ler o perfil pode acabar lendo segredos junto.
3. Nao ha trilha especifica de quem visualizou/copiou senha.

## Alvo recomendado

Criar uma tabela dedicada:

- `cliente_programa_acessos`
- `cliente_programa_acesso_audit_logs`

A tela continua simples para o manager, mas o fluxo passa pelo backend:

1. Manager abre perfil do cliente.
2. Front chama API do backend.
3. Backend valida permissao.
4. Backend descriptografa e entrega os dados permitidos.
5. Backend registra auditoria quando segredo e exibido.

## Regras de permissao

Pode acessar:

- admin global
- admin da equipe do cliente
- CS autorizado pela equipe
- gestor vinculado ao cliente
- o proprio cliente, se o produto decidir permitir visibilidade para ele

Por padrao, eu recomendo:

- manager/CS/admin: pode ver e editar
- cliente: pode ver apenas se isso for decisao explicita de produto

## Armazenamento

Nunca salvar plaintext em tabela publica.

Campos esperados:

- `programa`
- `login_ciphertext`
- `senha_ciphertext`
- `observacoes_ciphertext`
- `cliente_id`
- `created_by`
- `updated_by`
- `created_at`
- `updated_at`

A chave de criptografia fica fora do browser, em env do backend, por exemplo:

- `PROGRAM_ACCESS_ENCRYPTION_KEY`

## Auditoria

Toda acao sensivel deve gerar log:

- `list`
- `view_secret`
- `create`
- `update`
- `archive`
- `delete`

Metadata sem segredo. Nunca registrar senha em log.

## Migracao segura

Fase 1. Criar tabelas e API nova.
Fase 2. Tela le dados pela API nova, mas ainda mantem fallback do jsonb.
Fase 3. Migrar dados antigos do jsonb para tabela nova via script com criptografia.
Fase 4. Remover `acessos` do `configuracao_tema` apos validacao.

## Status

Migration draft criada em:

`supabase/migrations/20260531120000_cliente_programa_acessos_secure.sql`

Ainda nao aplicar em producao sem revisar a API de criptografia e o plano de migracao.


## API criada

Backend route criada em ackend/src/routes/programAccess.js e montada em /api/program-access.

Endpoints iniciais:

- GET /api/program-access/clientes/:clienteId/acessos?reveal=true|false`n- POST /api/program-access/clientes/:clienteId/acessos`n- PATCH /api/program-access/acessos/:acessoId`n- DELETE /api/program-access/acessos/:acessoId`, arquiva em vez de apagar.

A API exige Bearer token, valida role de manager/CS/admin, usa service role no banco, criptografa com PROGRAM_ACCESS_ENCRYPTION_KEY e grava audit log.
