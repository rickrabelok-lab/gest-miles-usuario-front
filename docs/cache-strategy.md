# Estratégia de Cache — React Query (TanStack Query)

> Última atualização: 2026-04-12 (Prompt 4)

## Visão Geral

O Gest Miles usa `@tanstack/react-query` nos 3 frontends. Cada um tem um `QueryClient` com defaults ajustados ao seu perfil de uso.

## Configuração Global por Projeto

| Projeto | `staleTime` | `retry` | `refetchOnWindowFocus` |
|---------|-------------|---------|------------------------|
| **usuario-front** | 30 s | 1 | `false` |
| **manager-front** | 30 s | 1 | `false` |
| **admin-front** | 60 s | 1 | (default: `true`) |

### Porquê `refetchOnWindowFocus: false` no usuario e manager?

Estes frontends têm **canais Supabase Realtime** (`useGestor`, `DashboardHeader`) que invalidam queries automaticamente quando há alterações. O refetch por foco redundaria com a invalidação por evento, gerando tráfego desnecessário.

O admin-front não tem realtime configurado, por isso mantém o refetch por foco como safety net.

## Categorias de Dados e staleTime Recomendado

| Categoria | Exemplos | `staleTime` | Notas |
|-----------|----------|-------------|-------|
| **Estático / Config** | `subscription_plans`, nomes de equipes (`cs_equipes_nomes`), lista de tabelas de audit logs | 5–30 min | Não muda durante uma sessão. Override individual com `staleTime: 300_000` ou mais. |
| **Sessão / Perfil** | `cliente_gestores_perfis`, `perfis`, `preferencias_usuario` | 1–5 min | Muda raramente; invalidar em mutações (já implementado). |
| **Volátil** | `demandas_cliente`, `tarefas_cs`, `notificacoes_own`, `alertas_sistema`, `gestor_logs_acoes` | 0–60 s | Invalidar via mutations + realtime channels. O `staleTime` global de 30 s cobre bem. |
| **Realtime** | Demandas (canal `postgres_changes`), perfis (canal) | 0 s | Freshness vem da invalidação por subscripção; `staleTime` curto ou 0. |
| **Agregados admin** | `useAdminDashboard` (6+ queries paralelas) | 2–5 min | Dados pesados; cachear agressivamente. Candidato a migrar de `useState+useEffect` para `useQuery`. |
| **Audit logs** | `useAuditLogs` (paginado) | 15 s (lista), 2 min (tabelas) | Já configurado nos hooks `useAuditLogs.ts`. |

## Hooks com staleTime Explícito

| Hook | queryKey | staleTime | Projeto |
|------|----------|-----------|---------|
| `useAuditLogs` | `["audit-logs", filters]` | 15 s | manager, admin |
| `useAuditLogsTables` | `["audit-logs-tables"]` | 120 s | manager, admin |

## Padrões de Invalidação

### Mutações → `invalidateQueries`

Todas as mutações invalidam as queryKeys relacionadas. Exemplo:

```typescript
// useProgramasCliente
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ["programas_cliente", clienteId] });
}
```

### Realtime → `invalidateQueries`

```typescript
// useGestor.ts — canal Supabase
supabase.channel("demandas_changes")
  .on("postgres_changes", { event: "INSERT", table: "demandas_cliente" }, () => {
    queryClient.invalidateQueries({ queryKey: ["gestor_demandas_cliente"] });
  })
```

### Padrões Faltantes Identificados

| Situação | O que falta | Impacto |
|----------|-------------|---------|
| `useCsProvisionConta` após criar conta | Não invalida `gestor_programas_cliente` nem `gestor_demandas_cliente` | Lista pode ficar stale até próximo refetch |
| `useTriggerTaskFromInsight` | Não invalida `tarefas_cs` | Tarefa criada não aparece imediatamente na lista CS |

**Recomendação:** Adicionar invalidações em falta nos `onSuccess` destes hooks.

## Candidatos a Migração para useQuery

Estes hooks usam `useState + useEffect + fetch` manual e beneficiariam de migração:

| Ficheiro | Dados | Benefício |
|----------|-------|-----------|
| `admin-front/.../useAdminDashboard.ts` | Dashboard agregado (6+ queries) | Cache automático, `keepPreviousData`, loading states |
| `admin-front/.../useAssinaturasAdmin.ts` | Lista de assinaturas | Invalidação via `useMutation`, retry automático |
| `admin-front/.../useGestoresEscopo.ts` | Gestores filtrados por equipe | Cache por `queryKey` dinâmico |
| `usuario-front/.../useBonusOffers.ts` | Ofertas de bónus activas | `staleTime` longo (promoções mudam raramente) |
| `usuario-front/.../AssinaturaClientePage.tsx` | Planos Stripe + perfil | 2 queries naturais com `enabled: !!token` |

## Diagrama de Fluxo

```
[Componente] → useQuery(key, fn)
                    ↓
            [QueryCache]
            ├── fresh → return cache
            └── stale → background refetch
                    ↓
            [Supabase / API]
                    ↓
            [onSuccess → update cache]

[Mutation] → onSuccess → invalidateQueries(keys)
                              ↓
                    [Refetch dependentes]

[Realtime Channel] → on event → invalidateQueries(keys)
                                      ↓
                            [Refetch dependentes]
```
