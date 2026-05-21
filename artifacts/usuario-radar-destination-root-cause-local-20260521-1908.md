# Usuario Radar/Destination root-cause local - 2026-05-21 19:08 UTC

## Escopo

- Repo: `gest-miles-usuario-front`
- Arquivos alterados localmente:
  - `src/pages/RadarOportunidadesPage.tsx`
  - `src/hooks/useDestinationBestPrices.ts`

## Mudancas validadas

- Radar: remove timeout/AbortController do carregamento inicial e limita a consulta inicial de `oportunidades_voo` para as 80 oportunidades mais recentes, com mensagem de erro local.
- Destination Best Prices: remove timeout do hook e adiciona cache local de 15 min por combinação destinos/origens.

## Risco / nota comportamental

- Radar passa a operar explicitamente como lista inicial de oportunidades recentes. Isso reduz carga, mas filtros client-side podem nao enxergar oportunidades antigas fora das 80 primeiras.
- Destination ganha cache em camada de hook, alem dos mecanismos ja existentes no engine.

## Evidencia

- `git diff --check`: OK
- `npm exec tsc -- --noEmit --pretty false`: OK
- `npm run lint`: OK
- `npm run build`: OK
- `npm run test`: OK, 2 arquivos / 7 testes

## Sensivel nao executado

- Sem commit, push, deploy, migration, banco real, secrets, `.env`, gasto, envio externo ou exclusao destrutiva.
