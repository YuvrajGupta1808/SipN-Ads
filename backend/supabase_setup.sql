-- Run this once in the Supabase SQL editor to set up all required tables.

-- Enable pgvector extension
create extension if not exists vector;

-- Brand profiles table
create table if not exists brand_profiles (
  id            text primary key,
  name          text not null,
  tone          text,
  color         text default '#f97316',
  tagline       text,
  description   text,
  logo_url      text,
  product_image_urls  jsonb default '[]',
  platforms     jsonb default '[]',
  brand_rules   jsonb default '[]',
  constraints   jsonb default '[]',
  learnings     jsonb default '[]',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- Brand embeddings table (nomic-embed-text-v1.5 uses 768 dims)
create table if not exists brand_embeddings (
  id         bigserial primary key,
  brand_id   text references brand_profiles(id) on delete cascade,
  text       text,
  embedding  vector(768),
  created_at timestamptz default now()
);

-- Asset metadata table
create table if not exists assets (
  id         text primary key,
  brand_id   text references brand_profiles(id) on delete cascade,
  url        text not null,
  filename   text,
  tags       jsonb default '[]',
  embedding  vector(768),
  created_at timestamptz default now()
);

-- Legacy ad_sessions table is no longer used by the app.
-- Safe to drop if it exists so the schema stays minimal.
drop table if exists ad_sessions cascade;

-- Ad templates (high-scoring ads saved as reusable templates)
create table if not exists ad_templates (
  id                   text primary key,
  brand_id             text references brand_profiles(id) on delete cascade,
  title                text,
  thumbnail_url        text,
  story_plan           jsonb,
  scores               jsonb,
  -- Fields used by the template_builder service (backfilled via ALTERs below)
  source_job_id        text,
  source_variant_id    text,
  overall_score        double precision,
  cta_clarity_score    double precision,
  hook_strength_score  double precision,
  brand_compliance_score double precision,
  hook_text            text,
  cta_text             text,
  timeline_json        jsonb,
  resolution           text,
  total_duration_ms    bigint,
  created_at           timestamptz default now()
);

-- Ensure ad_templates has all columns expected by the backend, even if the
-- table was created before this script was updated.
alter table if exists ad_templates
  add column if not exists source_job_id         text,
  add column if not exists source_variant_id     text,
  add column if not exists overall_score         double precision,
  add column if not exists cta_clarity_score     double precision,
  add column if not exists hook_strength_score   double precision,
  add column if not exists brand_compliance_score double precision,
  add column if not exists hook_text             text,
  add column if not exists cta_text              text,
  add column if not exists timeline_json         jsonb,
  add column if not exists resolution            text,
  add column if not exists total_duration_ms     bigint;

-- Ad export logs used by the learner + memory_updater to improve brand_profiles
create table if not exists ad_exports (
  id                     text primary key,
  brand_id               text references brand_profiles(id) on delete cascade,
  job_id                 text,
  variant_id             text,
  cta_clarity_score      double precision,
  hook_strength_score    double precision,
  brand_compliance_score double precision,
  overall_score          double precision,
  fixes_applied          jsonb default '[]',
  hook_text              text,
  cta_text               text,
  created_at             timestamptz default now()
);

-- pgvector similarity search function for assets
create or replace function match_assets(
  query_embedding vector(768),
  match_count     int default 5
)
returns table (
  id        text,
  brand_id  text,
  url       text,
  filename  text,
  tags      jsonb,
  similarity float
)
language sql stable
as $$
  select
    id, brand_id, url, filename, tags,
    1 - (embedding <=> query_embedding) as similarity
  from assets
  where embedding is not null
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- Indexes
create index if not exists idx_brand_profiles_name on brand_profiles(name);
create index if not exists idx_assets_brand_id on assets(brand_id);
create index if not exists idx_brand_embeddings_brand_id on brand_embeddings(brand_id);
create index if not exists idx_ad_templates_brand_id on ad_templates(brand_id);
create index if not exists idx_ad_exports_brand_id on ad_exports(brand_id);
