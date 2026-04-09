# Mile Manager Pro

Sistema de gestão de milhas e pontos de fidelidade.

## Arquitetura

```
/backend     → API Express (porta 3000) — Supabase, BFF, rotas /api/*
/src         → App React (Vite) — única árvore de código do front
/docs        → Documentação complementar (ex.: prd)
```

Contrato HTTP do BFF: **`backend/docs/api.md`**.  
SQL consolidado para produção (bônus, calendário, voos demo): **`MIGRATION_TOTAL_DATA.sql`** na raiz deste repositório.

## Desenvolvimento

### Modo padrão (Supabase direto)

O app na raiz usa Supabase diretamente no browser (comportamento atual).

```bash
npm install
npm run dev
```

Acesse: http://localhost:3080

### Modo com backend separado

1. Configure o backend:

```bash
cd backend
cp .env.example .env
# Edite .env com SUPABASE_URL e SUPABASE_ANON_KEY
npm install
npm run dev
```

2. Na raiz, crie `.env.local` com:

```bash
VITE_API_URL=http://localhost:3000
```

3. Rode ambos:

```bash
npm run dev:all
```

- Backend: http://localhost:3000
- Front: http://localhost:3080

## Deploy Supabase (produção)

1. No painel do projeto → **SQL Editor**, execute o ficheiro **`MIGRATION_TOTAL_DATA.sql`** (ou a migration equivalente em `supabase/migrations/`).
2. Confirme que as tabelas `bonus_offers`, `calendar_prices` e `demo_flights` existem e têm políticas RLS de leitura conforme o script.

## Documentação da API

- BFF: [backend/docs/api.md](backend/docs/api.md)  
- Cópia / índice legado na raiz: [docs/api.md](docs/api.md) (se existir)
