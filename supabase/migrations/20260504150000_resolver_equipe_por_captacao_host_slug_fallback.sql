-- Slug da captação: antes exigia linha com slug não vazio; agora usa fallback para a linha mais recente.
-- Evita RPC vazia e redirecionamento para /auth quando o domínio customizado já está ativo.

create or replace function public.resolver_equipe_por_captacao_host(p_host text)
returns table (equipe_id uuid, slug text)
language sql
stable
security definer
set search_path = public, auth
as $$
  with host_norm as (
    select public.normalize_captacao_domain(p_host) as host
  ),
  domain_hit as (
    select ccd.equipe_id
      from public.captacao_custom_domains ccd
      join host_norm hn on hn.host = ccd.domain_normalized
     where ccd.is_active = true
     limit 1
  ),
  slug_pick as (
    select
      dh.equipe_id,
      nullif(
        btrim(
          coalesce(
            (select chm.slug
               from public.captacao_hero_metrics chm
              where chm.equipe_id = dh.equipe_id
                and coalesce(nullif(btrim(chm.slug), ''), '') <> ''
              order by chm.updated_at desc
              limit 1),
            (select chm.slug
               from public.captacao_hero_metrics chm
              where chm.equipe_id = dh.equipe_id
              order by chm.updated_at desc
              limit 1)
          )
        ),
        ''
      ) as slug
    from domain_hit dh
  )
  select sp.equipe_id, sp.slug
    from slug_pick sp
   where sp.slug is not null;
$$;

comment on function public.resolver_equipe_por_captacao_host(text) is
  'Resolve host customizado para equipe_id e slug da captação pública (slug mais recente em captacao_hero_metrics).';
