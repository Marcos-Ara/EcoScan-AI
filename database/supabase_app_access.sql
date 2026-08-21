-- EcoScan AI - acesso do frontend à base de conhecimento
-- Seguro para executar depois que o banco principal já estiver criado.

grant select on public.object_aliases to anon, authenticated;
grant select on public.ecoscan_object_master to anon, authenticated;
grant select on public.ecoscan_variant_master to anon, authenticated;

-- As tabelas abaixo já fazem parte da base e podem ser lidas pelo app
-- quando RLS/políticas permitirem.
grant select on public.object_variants to anon, authenticated;
grant select on public.materials to anon, authenticated;
grant select on public.categories to anon, authenticated;
grant select on public.disposal_rules to anon, authenticated;
grant select on public.bins to anon, authenticated;
grant select on public.destinations to anon, authenticated;
