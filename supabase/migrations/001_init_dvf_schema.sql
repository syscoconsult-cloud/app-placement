-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- DVF Transactions table (public reference data)
create table if not exists dvf_transactions (
  id uuid primary key default uuid_generate_v4(),
  insee_code text not null,
  postal_code text not null,
  transaction_date date not null,
  price numeric not null check (price > 0),
  surface_m2 numeric not null check (surface_m2 > 0),
  price_per_m2 numeric not null check (price_per_m2 > 0),
  property_type text not null,
  raw_data jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists dvf_transactions_insee_code on dvf_transactions(insee_code);
create index if not exists dvf_transactions_postal_code on dvf_transactions(postal_code);
create index if not exists dvf_transactions_transaction_date on dvf_transactions(transaction_date);

-- Zone statistics (aggregated, refreshed periodically)
create table if not exists zone_stats (
  insee_code text primary key,
  avg_price_per_m2 numeric,
  median_price_per_m2 numeric,
  price_trend_3y_pct numeric,
  transaction_count int default 0,
  updated_at timestamptz default now()
);

create index if not exists zone_stats_updated_at on zone_stats(updated_at);

-- Properties table (aggregated listings from all sources)
create table if not exists properties (
  id uuid primary key default uuid_generate_v4(),
  source text not null,
  source_url text not null,
  title text not null,
  price numeric not null check (price > 0),
  surface_m2 numeric,
  price_per_m2 numeric,
  city text,
  postal_code text,
  insee_code text,
  property_type text,
  rooms int,
  dpe_class text,
  description text,
  raw_data jsonb,
  first_seen_at timestamptz default now(),
  last_seen_at timestamptz default now(),
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint unique_source_url unique (source, source_url)
);

create index if not exists properties_source on properties(source);
create index if not exists properties_insee_code on properties(insee_code);
create index if not exists properties_price_per_m2 on properties(price_per_m2);
create index if not exists properties_is_active on properties(is_active);
create index if not exists properties_last_seen_at on properties(last_seen_at);

-- Scoring weights configuration (user-specific, RLS enabled)
create table if not exists scoring_weights (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  weight_discount_vs_market numeric default 0.3 check (weight_discount_vs_market >= 0 and weight_discount_vs_market <= 1),
  weight_rental_yield numeric default 0.3 check (weight_rental_yield >= 0 and weight_rental_yield <= 1),
  weight_zone_dynamics numeric default 0.2 check (weight_zone_dynamics >= 0 and weight_zone_dynamics <= 1),
  weight_other_factors numeric default 0.2 check (weight_other_factors >= 0 and weight_other_factors <= 1),
  is_active boolean default true,
  alert_threshold numeric default 60 check (alert_threshold >= 0 and alert_threshold <= 100),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists scoring_weights_user_id on scoring_weights(user_id);
create index if not exists scoring_weights_is_active on scoring_weights(is_active);

-- Property scores (computed for each property × scoring profile)
create table if not exists property_scores (
  id uuid primary key default uuid_generate_v4(),
  property_id uuid not null references properties(id) on delete cascade,
  scoring_weights_id uuid not null references scoring_weights(id) on delete cascade,
  discount_score numeric,
  yield_score numeric,
  zone_score numeric,
  other_score numeric,
  total_score numeric,
  computed_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint unique_property_scoring unique (property_id, scoring_weights_id)
);

create index if not exists property_scores_property_id on property_scores(property_id);
create index if not exists property_scores_scoring_weights_id on property_scores(scoring_weights_id);
create index if not exists property_scores_total_score on property_scores(total_score);

-- Alerts sent (history, prevent duplicates)
create table if not exists alerts_sent (
  id uuid primary key default uuid_generate_v4(),
  property_id uuid not null references properties(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  sent_at timestamptz default now(),
  created_at timestamptz default now(),
  constraint unique_alert_per_user unique (property_id, user_id)
);

create index if not exists alerts_sent_user_id on alerts_sent(user_id);
create index if not exists alerts_sent_property_id on alerts_sent(property_id);
create index if not exists alerts_sent_sent_at on alerts_sent(sent_at);

-- Enable RLS
alter table scoring_weights enable row level security;
alter table property_scores enable row level security;
alter table alerts_sent enable row level security;

-- RLS Policies for scoring_weights
create policy "Users can view their own scoring weights"
  on scoring_weights for select
  using (auth.uid() = user_id);

create policy "Users can create their own scoring weights"
  on scoring_weights for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own scoring weights"
  on scoring_weights for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own scoring weights"
  on scoring_weights for delete
  using (auth.uid() = user_id);

-- RLS Policies for property_scores (can view if owns scoring_weights)
create policy "Users can view scores from their scoring weights"
  on property_scores for select
  using (
    exists (
      select 1 from scoring_weights sw
      where sw.id = property_scores.scoring_weights_id
      and sw.user_id = auth.uid()
    )
  );

-- RLS Policies for alerts_sent
create policy "Users can view their own alerts"
  on alerts_sent for select
  using (auth.uid() = user_id);

create policy "Users can create their own alerts"
  on alerts_sent for insert
  with check (auth.uid() = user_id);

-- Public tables don't need RLS (DVF, properties, zone_stats are public)
alter table dvf_transactions disable row level security;
alter table zone_stats disable row level security;
alter table properties disable row level security;
