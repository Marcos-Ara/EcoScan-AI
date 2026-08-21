-- ============================================================
-- EcoScan AI - acesso público somente leitura à base de
-- conhecimento do Supabase.
--
-- Firebase continua responsável pela autenticação.
-- Supabase é somente o banco de conhecimento.
--
-- Execute este arquivo em uma NOVA QUERY do Supabase SQL Editor.
-- ============================================================


-- ============================================================
-- 1. PERMISSÕES
-- ============================================================

grant select on public.object_aliases to anon, authenticated;
grant select on public.object_variants to anon, authenticated;
grant select on public.materials to anon, authenticated;
grant select on public.categories to anon, authenticated;
grant select on public.disposal_rules to anon, authenticated;
grant select on public.bins to anon, authenticated;
grant select on public.destinations to anon, authenticated;

grant select on public.special_waste_classes to anon, authenticated;
grant select on public.object_special_waste to anon, authenticated;

grant select on public.characteristics to anon, authenticated;
grant select on public.variant_characteristics to anon, authenticated;
grant select on public.classification_rules to anon, authenticated;

grant select on public.tags to anon, authenticated;
grant select on public.variant_tags to anon, authenticated;

grant select on public.object_images to anon, authenticated;
grant select on public.variant_images to anon, authenticated;

grant select on public.ecoscan_object_master to anon, authenticated;
grant select on public.ecoscan_variant_master to anon, authenticated;


-- ============================================================
-- 2. CATEGORIAS
-- ============================================================

alter table public.categories enable row level security;

drop policy if exists "EcoScan public read active categories"
on public.categories;

create policy "EcoScan public read active categories"
on public.categories
for select
to anon, authenticated
using (is_active = true);


-- ============================================================
-- 3. MATERIAIS
-- ============================================================

alter table public.materials enable row level security;

drop policy if exists "EcoScan public read active materials"
on public.materials;

create policy "EcoScan public read active materials"
on public.materials
for select
to anon, authenticated
using (is_active = true);


-- ============================================================
-- 4. OBJETOS
-- ============================================================

alter table public.objects enable row level security;

drop policy if exists "EcoScan public read active objects"
on public.objects;

create policy "EcoScan public read active objects"
on public.objects
for select
to anon, authenticated
using (is_active = true);


-- ============================================================
-- 5. ALIASES
-- ============================================================

alter table public.object_aliases enable row level security;

drop policy if exists "EcoScan public read active aliases"
on public.object_aliases;

create policy "EcoScan public read active aliases"
on public.object_aliases
for select
to anon, authenticated
using (is_active = true);


-- ============================================================
-- 6. VARIANTES
-- ============================================================

alter table public.object_variants enable row level security;

drop policy if exists "EcoScan public read active variants"
on public.object_variants;

create policy "EcoScan public read active variants"
on public.object_variants
for select
to anon, authenticated
using (is_active = true);


-- ============================================================
-- 7. REGRAS DE DESCARTE
-- ============================================================

alter table public.disposal_rules enable row level security;

drop policy if exists "EcoScan public read active disposal rules"
on public.disposal_rules;

create policy "EcoScan public read active disposal rules"
on public.disposal_rules
for select
to anon, authenticated
using (is_active = true);


-- ============================================================
-- 8. LIXEIRAS
-- ============================================================

alter table public.bins enable row level security;

drop policy if exists "EcoScan public read active bins"
on public.bins;

create policy "EcoScan public read active bins"
on public.bins
for select
to anon, authenticated
using (is_active = true);


-- ============================================================
-- 9. DESTINOS
-- ============================================================

alter table public.destinations enable row level security;

drop policy if exists "EcoScan public read active destinations"
on public.destinations;

create policy "EcoScan public read active destinations"
on public.destinations
for select
to anon, authenticated
using (is_active = true);


-- ============================================================
-- 10. RESÍDUOS ESPECIAIS
-- ============================================================

alter table public.special_waste_classes enable row level security;

drop policy if exists "EcoScan public read active special waste classes"
on public.special_waste_classes;

create policy "EcoScan public read active special waste classes"
on public.special_waste_classes
for select
to anon, authenticated
using (is_active = true);


alter table public.object_special_waste enable row level security;

drop policy if exists "EcoScan public read active object special waste"
on public.object_special_waste;

create policy "EcoScan public read active object special waste"
on public.object_special_waste
for select
to anon, authenticated
using (
    is_active = true
);


-- ============================================================
-- 11. CARACTERÍSTICAS
-- ============================================================

alter table public.characteristics enable row level security;

drop policy if exists "EcoScan public read active characteristics"
on public.characteristics;

create policy "EcoScan public read active characteristics"
on public.characteristics
for select
to anon, authenticated
using (is_active = true);


alter table public.variant_characteristics enable row level security;

drop policy if exists "EcoScan public read variant characteristics"
on public.variant_characteristics;

create policy "EcoScan public read variant characteristics"
on public.variant_characteristics
for select
to anon, authenticated
using (
    exists (
        select 1
        from public.object_variants v
        join public.characteristics c
          on c.id = variant_characteristics.characteristic_id
        where v.id = variant_characteristics.variant_id
          and v.is_active = true
          and c.is_active = true
    )
);


-- ============================================================
-- 12. REGRAS DE CLASSIFICAÇÃO
-- ============================================================

alter table public.classification_rules enable row level security;

drop policy if exists "EcoScan public read active classification rules"
on public.classification_rules;

create policy "EcoScan public read active classification rules"
on public.classification_rules
for select
to anon, authenticated
using (is_active = true);


-- ============================================================
-- 13. TAGS
-- ============================================================

alter table public.tags enable row level security;

drop policy if exists "EcoScan public read active tags"
on public.tags;

create policy "EcoScan public read active tags"
on public.tags
for select
to anon, authenticated
using (is_active = true);


alter table public.variant_tags enable row level security;

drop policy if exists "EcoScan public read active variant tags"
on public.variant_tags;

create policy "EcoScan public read active variant tags"
on public.variant_tags
for select
to anon, authenticated
using (
    exists (
        select 1
        from public.object_variants v
        join public.tags t
          on t.id = variant_tags.tag_id
        where v.id = variant_tags.variant_id
          and v.is_active = true
          and t.is_active = true
    )
);


-- ============================================================
-- 14. IMAGENS
-- ============================================================

alter table public.object_images enable row level security;

drop policy if exists "EcoScan public read active object images"
on public.object_images;

create policy "EcoScan public read active object images"
on public.object_images
for select
to anon, authenticated
using (is_active = true);


alter table public.variant_images enable row level security;

drop policy if exists "EcoScan public read active variant images"
on public.variant_images;

create policy "EcoScan public read active variant images"
on public.variant_images
for select
to anon, authenticated
using (is_active = true);


-- ============================================================
-- 15. TESTES DIRETOS
-- ============================================================

select 'categories' as source, count(*) as total
from public.categories
where is_active = true

union all

select 'materials', count(*)
from public.materials
where is_active = true

union all

select 'objects', count(*)
from public.objects
where is_active = true

union all

select 'object_aliases', count(*)
from public.object_aliases
where is_active = true

union all

select 'object_variants', count(*)
from public.object_variants
where is_active = true;


-- Teste das views
select
    'ecoscan_object_master' as source,
    count(*) as total
from public.ecoscan_object_master

union all

select
    'ecoscan_variant_master',
    count(*)
from public.ecoscan_variant_master;


-- Teste específico do COCO-SSD -> bottle
select
    object_id,
    variant_id,
    alias,
    normalized_alias,
    is_active
from public.object_aliases
where is_active = true
  and (
      normalized_alias = 'bottle'
      or lower(alias) = 'bottle'
  )
order by confidence_hint desc nulls last
limit 10;


-- ============================================================
-- FIM
-- ============================================================
