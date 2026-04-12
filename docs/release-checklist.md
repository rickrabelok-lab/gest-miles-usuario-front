# Checklist de Go-Live — Gest Miles

> Última atualização: 2026-04-12 (Prompt 4)

## 1. Pré-Deploy

### 1.1 Variáveis de Ambiente

- [ ] **Rotação de chaves Supabase:** Gerar novas `anon` key e `service_role` key no dashboard Supabase (Settings → API)
- [ ] **Atualizar segredos no Vercel:** `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL` nos 3 projetos (usuario, manager, admin) + backend
- [ ] **Stripe keys:** Confirmar que `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET` estão configuradas no backend de produção (Vercel env)
- [ ] **Brevo API key:** Validar `BREVO_API_KEY` no backend
- [ ] **Nunca expor `service_role` no browser:** Verificar que apenas `anon` key está em variáveis `VITE_*`
- [ ] **`.env.local` / `.env`:** Não commitados (confirmar `.gitignore`)

### 1.2 Migrations de Banco

- [ ] Aplicar todas as migrations em ordem no Supabase de produção:
  ```
  20260416120000_audit_logs.sql
  20260416130000_audit_logs_equipe_id.sql
  20260416140000_rls_hardening_indexes.sql
  ```
- [ ] Verificar que `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` está ativo em **todas** as tabelas:
  ```sql
  SELECT schemaname, tablename, rowsecurity
  FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY tablename;
  ```
- [ ] Confirmar que funções SECURITY DEFINER (`audit_log_write`, `audit_log_trigger`, `insights_cliente_sync_for_cliente`) existem e têm `search_path = public`

### 1.3 RLS — Verificação Manual

- [ ] **organizacoes_cliente:** Testar com user autenticado (não admin) — deve ver apenas a sua organização
- [ ] **insights_cliente:** Testar com team admin — deve ver insights da sua equipa
- [ ] **audit_logs:** Testar com team admin — vê apenas logs da sua equipe_id
- [ ] **audit_logs:** Testar com legacy platform admin — vê todos os logs
- [ ] **perfis:** Confirmar que RLS está activo (`SELECT rowsecurity FROM pg_tables WHERE tablename = 'perfis'`)
- [ ] **Cross-tenant isolation:** Com 2 equipes diferentes, admin A não deve ver dados da equipe B

### 1.4 Stripe

- [ ] Webhook configurado para o domínio de produção (`https://api.gestmiles.com/api/stripe/webhook` ou equivalente)
- [ ] Eventos do webhook:
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`
- [ ] **Signing secret** do webhook de produção atualizado no backend
- [ ] Testar pagamento de teste no modo live (ou último teste em modo test)

### 1.5 Build e Deploy

- [ ] `pnpm build` sem erros nos 3 frontends
- [ ] `pnpm build` sem erros no backend
- [ ] Verificar que não há `console.log` desnecessários em produção (especialmente dados sensíveis)
- [ ] Confirmar que `sourceMap` está desativado ou restrito em produção

## 2. Deploy

### 2.1 Ordem de Deploy

1. **Migrations SQL** (Supabase Dashboard → SQL Editor)
2. **Backend** (Vercel — função serverless)
3. **admin-front** (Vercel)
4. **manager-front** (Vercel)
5. **usuario-front** (Vercel)

### 2.2 Smoke Tests Pós-Deploy

- [ ] Login funciona nos 3 frontends
- [ ] Dashboard carrega sem erros de rede (DevTools → Network)
- [ ] Criar demanda funciona (gestor)
- [ ] Aba "Logs" no manager mostra dados (se existirem audit_logs)
- [ ] Admin master vê logs de todas as empresas
- [ ] Assinatura/planos carrega no usuario-front
- [ ] Webhook Stripe: enviar evento de teste e confirmar processamento

## 3. Monitorização Inicial (Primeiras 48h)

### 3.1 Métricas a Acompanhar

| Métrica | Onde verificar | Threshold de alerta |
|---------|----------------|---------------------|
| Erros 500 no backend | Vercel Dashboard → Functions | > 5 por hora |
| RLS violations (403/empty responses) | Supabase Dashboard → Logs | Qualquer ocorrência inesperada |
| Latência de queries | Supabase Dashboard → Performance | > 500ms p95 |
| Webhook failures | Stripe Dashboard → Developers → Webhooks | > 3 falhas consecutivas |
| Build deploys | Vercel Dashboard | Falha de deploy |

### 3.2 Logs Prioritários

```sql
-- Últimos erros de RLS no Supabase (Edge Logs)
-- Dashboard → Logs → Edge Logs → filter: status >= 400

-- Audit logs recentes (validar que estão a ser escritos)
SELECT id, acao, tabela, created_at
FROM public.audit_logs
ORDER BY created_at DESC
LIMIT 20;
```

### 3.3 Alertas

- [ ] Configurar alertas no Vercel para erros de função (> 5/hora)
- [ ] Configurar alertas no Stripe para falhas de webhook
- [ ] Monitorizar Supabase usage (requests/s, bandwidth)

## 4. Comunicação à Equipa

### 4.1 Antes do Deploy

- [ ] Notificar equipa sobre janela de deploy (data/hora)
- [ ] Documentar breaking changes (se houver)
- [ ] Partilhar este checklist com todos os envolvidos

### 4.2 Após Deploy

- [ ] Confirmar sucesso do deploy em canal da equipa
- [ ] Partilhar link para monitorização (Vercel + Supabase)
- [ ] Reportar qualquer anomalia nas primeiras 2h

## 5. Plano de Rollback

### 5.1 Frontend (Vercel)

```bash
# Reverter para deploy anterior
# Vercel Dashboard → Project → Deployments → escolher último deploy estável → "Promote to Production"
```

Cada frontend pode ser revertido independentemente.

### 5.2 Backend (Vercel Functions)

Mesmo processo: Vercel Dashboard → redeploy da versão anterior.

### 5.3 Banco de Dados (Supabase)

**ATENÇÃO:** Migrations SQL não têm rollback automático. Para reverter:

```sql
-- Reverter migration 20260416140000 (RLS hardening):

-- 1. Restaurar índices removidos
CREATE INDEX IF NOT EXISTS idx_audit_logs_equipe_id
  ON public.audit_logs (equipe_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id
  ON public.audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_nps_convites_cliente
  ON public.nps_convites (cliente_id);

-- 2. Remover novos índices
DROP INDEX IF EXISTS idx_demandas_cliente_cliente_status_created;
DROP INDEX IF EXISTS idx_perfis_equipe_role;
DROP INDEX IF EXISTS idx_emissoes_cliente_data;
DROP INDEX IF EXISTS idx_logs_acoes_user_timestamp;

-- 3. Reverter policies de organizacoes_cliente
DROP POLICY IF EXISTS organizacoes_cliente_select ON public.organizacoes_cliente;
DROP POLICY IF EXISTS organizacoes_cliente_insert ON public.organizacoes_cliente;
DROP POLICY IF EXISTS organizacoes_cliente_update ON public.organizacoes_cliente;
DROP POLICY IF EXISTS organizacoes_cliente_delete ON public.organizacoes_cliente;
ALTER TABLE public.organizacoes_cliente DISABLE ROW LEVEL SECURITY;

-- 4. Restaurar policies originais de insights_cliente (sem team admin)
-- (executar o bloco original da migration 20260326120000)
```

### 5.4 Critérios para Rollback

| Situação | Acção |
|----------|-------|
| Erros 500 generalizados (> 20/hora) | Rollback backend imediato |
| Dados cross-tenant visíveis | Rollback migration + investigação urgente |
| Apenas UI quebrada num frontend | Rollback desse frontend apenas |
| Performance degradada (queries > 2s) | Investigar antes de rollback; pode ser índice em falta |
| Webhook Stripe a falhar | Verificar signing secret; rollback backend se necessário |

## 6. Pós Go-Live (Semana 1)

- [ ] Revisão de métricas de performance (query times, cache hit rate)
- [ ] Feedback da equipa sobre UX
- [ ] Planear migração dos hooks manuais (`useState+useEffect`) para React Query no admin-front
- [ ] Avaliar se `useMinhasReunioes` beneficia de uma view/RPC server-side
- [ ] Documentar quaisquer hotfixes aplicados
