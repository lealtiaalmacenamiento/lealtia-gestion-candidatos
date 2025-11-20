-- Phase 5: Segments, Campaigns, Product Types
-- Migración base para el sistema de campañas declarativas
-- Incluye: segments, user_segments, product_types, campaigns, campaign_rules,
-- campaign_rewards, campaign_segments, campaign_progress
-- Fecha: 2025-11-11
set check_function_bodies = off;

-- Ensure UUID generation helpers are available
create extension if not exists "pgcrypto" with schema public;

-- -----------------------------------------------------------------------------
-- 1. Catalogs & Segmentation
-- -----------------------------------------------------------------------------
create table if not exists public.segments (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    description text,
    active boolean not null default true,
    created_at timestamptz not null default timezone('utc'::text, now()),
    updated_at timestamptz not null default timezone('utc'::text, now())
);

create trigger trg_segments_set_updated_at
    before update on public.segments
    for each row
    execute function public.set_updated_at();

create table if not exists public.user_segments (
    usuario_id bigint not null references public.usuarios(id) on delete cascade,
    segment_id uuid not null references public.segments(id) on delete cascade,
    assigned_by bigint references public.usuarios(id),
    assigned_at timestamptz not null default timezone('utc'::text, now()),
    primary key (usuario_id, segment_id)
);

-- -----------------------------------------------------------------------------
-- 2. Product Types catalog (dynamic replacement for enum tipo_producto)
-- -----------------------------------------------------------------------------
create table if not exists public.product_types (
    id uuid primary key default gen_random_uuid(),
    code text not null unique,
    name text not null,
    description text,
    active boolean not null default true,
    created_at timestamptz not null default timezone('utc'::text, now()),
    updated_at timestamptz not null default timezone('utc'::text, now())
);

create trigger trg_product_types_set_updated_at
    before update on public.product_types
    for each row
    execute function public.set_updated_at();

alter table public.producto_parametros
    add column if not exists product_type_id uuid;

insert into public.product_types (code, name, description)
values
    ('VI', 'Vida Individual', 'Tipo migrado desde enum tipo_producto'),
    ('GMM', 'Gastos Médicos Mayores', 'Tipo migrado desde enum tipo_producto')
on conflict (code) do nothing;

update public.producto_parametros pp
set product_type_id = pt.id
from public.product_types pt
where pt.code = pp.tipo_producto::text
  and (pp.product_type_id is null);

alter table public.producto_parametros
    alter column product_type_id set not null,
    add constraint producto_parametros_product_type_fk
        foreign key (product_type_id) references public.product_types(id);

-- -----------------------------------------------------------------------------
-- 3. Campaigns core entities
-- -----------------------------------------------------------------------------
create type public.campaign_status as enum ('draft', 'active', 'paused', 'archived');
create type public.campaign_progress_status as enum ('not_eligible', 'eligible', 'completed');

create table public.campaigns (
    id uuid primary key default gen_random_uuid(),
    slug text not null unique,
    name text not null,
    summary text,
    description text,
    status public.campaign_status not null default 'draft',
    active_range daterange not null,
    primary_segment_id uuid references public.segments(id),
    notes text,
    created_by bigint references public.usuarios(id),
    created_at timestamptz not null default timezone('utc'::text, now()),
    updated_at timestamptz not null default timezone('utc'::text, now())
);

create trigger trg_campaigns_set_updated_at
    before update on public.campaigns
    for each row
    execute function public.set_updated_at();

create table public.campaign_rules (
    id uuid primary key default gen_random_uuid(),
    campaign_id uuid not null references public.campaigns(id) on delete cascade,
    scope text not null check (scope in ('eligibility', 'goal')),
    rule_kind text not null,
    config jsonb not null,
    priority integer not null default 0,
    description text,
    created_at timestamptz not null default timezone('utc'::text, now()),
    updated_at timestamptz not null default timezone('utc'::text, now())
);

create index campaign_rules_campaign_scope_idx
    on public.campaign_rules (campaign_id, scope, priority);

create trigger trg_campaign_rules_set_updated_at
    before update on public.campaign_rules
    for each row
    execute function public.set_updated_at();

create table public.campaign_rewards (
    id uuid primary key default gen_random_uuid(),
    campaign_id uuid not null references public.campaigns(id) on delete cascade,
    title text not null,
    description text,
    is_accumulative boolean not null default false,
    sort_order integer not null default 0,
    created_at timestamptz not null default timezone('utc'::text, now()),
    updated_at timestamptz not null default timezone('utc'::text, now())
);

create index campaign_rewards_campaign_idx
    on public.campaign_rewards (campaign_id, sort_order);

create trigger trg_campaign_rewards_set_updated_at
    before update on public.campaign_rewards
    for each row
    execute function public.set_updated_at();

create table public.campaign_segments (
    campaign_id uuid not null references public.campaigns(id) on delete cascade,
    segment_id uuid not null references public.segments(id) on delete cascade,
    sort_order integer not null default 0,
    primary key (campaign_id, segment_id)
);

create table public.campaign_progress (
    id uuid primary key default gen_random_uuid(),
    campaign_id uuid not null references public.campaigns(id) on delete cascade,
    usuario_id bigint not null references public.usuarios(id) on delete cascade,
    eligible boolean not null default false,
    progress numeric(6,3) not null default 0,
    status public.campaign_progress_status not null default 'not_eligible',
    metrics jsonb,
    evaluated_at timestamptz not null default timezone('utc'::text, now()),
    created_at timestamptz not null default timezone('utc'::text, now()),
    updated_at timestamptz not null default timezone('utc'::text, now()),
    constraint campaign_progress_progress_range check (progress >= 0)
);

create unique index campaign_progress_unique_idx
    on public.campaign_progress (campaign_id, usuario_id);

create trigger trg_campaign_progress_set_updated_at
    before update on public.campaign_progress
    for each row
    execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 4. Row Level Security
-- -----------------------------------------------------------------------------
alter table public.segments enable row level security;
alter table public.user_segments enable row level security;
alter table public.product_types enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_rules enable row level security;
alter table public.campaign_rewards enable row level security;
alter table public.campaign_segments enable row level security;
alter table public.campaign_progress enable row level security;

create policy segments_select_all on public.segments
    for select using (true);

create policy segments_manage_super on public.segments
    for all
    using (public.is_super_role())
    with check (public.is_super_role());

create policy user_segments_super_manage on public.user_segments
    for all
    using (public.is_super_role())
    with check (public.is_super_role());

create policy product_types_select_all on public.product_types
    for select using (true);

create policy product_types_manage_super on public.product_types
    for all
    using (public.is_super_role())
    with check (public.is_super_role());

create policy campaigns_select_all on public.campaigns
    for select using (true);

create policy campaigns_manage_super on public.campaigns
    for all
    using (public.is_super_role())
    with check (public.is_super_role());

create policy campaign_rules_select_all on public.campaign_rules
    for select using (true);

create policy campaign_rules_manage_super on public.campaign_rules
    for all
    using (public.is_super_role())
    with check (public.is_super_role());

create policy campaign_rewards_select_all on public.campaign_rewards
    for select using (true);

create policy campaign_rewards_manage_super on public.campaign_rewards
    for all
    using (public.is_super_role())
    with check (public.is_super_role());

create policy campaign_segments_select_all on public.campaign_segments
    for select using (true);

create policy campaign_segments_manage_super on public.campaign_segments
    for all
    using (public.is_super_role())
    with check (public.is_super_role());

create policy campaign_progress_select_all on public.campaign_progress
    for select using (true);

create policy campaign_progress_manage_super on public.campaign_progress
    for all
    using (public.is_super_role())
    with check (public.is_super_role());

-- -----------------------------------------------------------------------------
-- 5. Comments & metadata (optional but useful)
-- -----------------------------------------------------------------------------
comment on table public.segments is 'Dynamic user segments for campaign targeting and UI grouping';
comment on table public.user_segments is 'Assignments of usuarios to custom segments';
comment on table public.product_types is 'Catalog of dynamic product types for producto_parametros';
comment on column public.producto_parametros.product_type_id is 'FK to product_types, replaces enum tipo_producto';
comment on table public.campaigns is 'Marketing/engagement campaigns managed by supervisors';
comment on table public.campaign_rules is 'Rule definitions (eligibility/goal) for campaigns';
comment on table public.campaign_rewards is 'Reward catalog per campaign';
comment on table public.campaign_segments is 'Explicit segment associations per campaign';
comment on table public.campaign_progress is 'Per-usuario campaign evaluation snapshots';

-- End of migration
