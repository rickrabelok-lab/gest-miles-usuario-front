-- Garante que rotas_premium tenha os campos essenciais: classe e regiao_destino.
-- Exemplo de dados:
--   origem | destino | programa     | classe    | milhas_necessarias | regiao_destino
--   GRU    | LIS     | LATAM Pass   | Executiva | 88000              | Europa
--   GRU    | MIA     | Smiles       | Executiva | 70000              | Estados Unidos
--   GRU    | SSA     | LATAM Pass   | Econômica | 12000              | Nordeste

alter table if exists public.rotas_premium
  add column if not exists classe text;

alter table if exists public.rotas_premium
  add column if not exists regiao_destino text;

comment on column public.rotas_premium.classe is 'Classe de cabine: Executiva, Econômica, Primeira Classe, etc.';
comment on column public.rotas_premium.regiao_destino is 'Região do destino para filtro: Europa, Nordeste, Estados Unidos, etc.';
