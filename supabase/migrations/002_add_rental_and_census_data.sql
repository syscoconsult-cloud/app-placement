-- Migration 002: Add rental and census data tables
-- Extends zone_stats with rental and demographic information

-- Zone rental statistics (ANIL, CLAMEUR data)
create table if not exists zone_rental_stats (
  id uuid primary key default uuid_generate_v4(),
  insee_code text not null unique,
  postal_code text not null unique,
  city text,

  -- Rental prices (€/m²/month)
  apartment_rental_per_m2 numeric,
  house_rental_per_m2 numeric,
  avg_rental_per_m2 numeric,

  -- Rental market trends
  rental_evolution_1y_pct numeric,
  rental_evolution_3y_pct numeric,

  -- Estimated yields
  estimated_yield_apartment_pct numeric,
  estimated_yield_house_pct numeric,

  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists zone_rental_insee on zone_rental_stats(insee_code);
create index if not exists zone_rental_postal on zone_rental_stats(postal_code);

-- INSEE demographic data (population, employment, income)
create table if not exists zone_demographics (
  id uuid primary key default uuid_generate_v4(),
  insee_code text primary key,
  postal_code text not null,
  commune_name text,

  -- Population metrics
  population int,
  population_density numeric, -- persons/km²
  median_age numeric,
  population_growth_1y_pct numeric,

  -- Employment metrics
  unemployment_rate numeric, -- %
  tertiary_sector_pct numeric, -- % jobs in services
  employment_accessibility numeric, -- score 0-100

  -- Income metrics
  median_income numeric,
  income_per_capita numeric,
  income_inequality_ratio numeric, -- Gini coefficient

  -- Urban metrics
  urbanization_level text, -- 'rural', 'semi-urban', 'urban', 'metropolitan'
  proximity_to_major_city int, -- km to nearest major center

  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists zone_demo_insee on zone_demographics(insee_code);
create index if not exists zone_demo_postal on zone_demographics(postal_code);

-- Geographic/geolocation data (RDNA basis)
create table if not exists zone_geolocation (
  id uuid primary key default uuid_generate_v4(),
  insee_code text primary key,
  postal_code text not null,

  -- Geographic center
  latitude numeric,
  longitude numeric,

  -- Regional hierarchy
  region_code text,
  region_name text,
  department_code text,
  department_name text,
  arrondissement_name text,

  -- Area metrics
  surface_km2 numeric,
  altitude_m int,

  -- Proximity indicators
  proximity_to_train_station int, -- km
  proximity_to_highway int, -- km
  proximity_to_airport int, -- km

  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists zone_geo_insee on zone_geolocation(insee_code);
create index if not exists zone_geo_postal on zone_geolocation(postal_code);
create index if not exists zone_geo_region on zone_geolocation(region_code);
create index if not exists zone_geo_dept on zone_geolocation(department_code);

-- Enhanced properties table with geolocation
alter table if exists properties
  add column if not exists latitude numeric,
  add column if not exists longitude numeric,
  add column if not exists geocoded_at timestamptz;

create index if not exists properties_geo on properties(latitude, longitude);

-- Update zone_stats to include rental reference
alter table if exists zone_stats
  add column if not exists avg_rental_per_m2 numeric,
  add column if not exists rental_evolution_1y_pct numeric;

-- View: Complete zone profile (combines all sources)
create or replace view zone_complete_profile as
select
  zs.insee_code,
  zs.postal_code,
  zd.commune_name,
  -- Price data
  zs.avg_price_per_m2 as price_avg_per_m2,
  zs.median_price_per_m2 as price_median_per_m2,
  zs.price_trend_3y_pct as price_trend,
  -- Rental data
  zrs.avg_rental_per_m2,
  zrs.rental_evolution_1y_pct,
  zrs.estimated_yield_apartment_pct,
  -- Demographics
  zd.population,
  zd.population_density,
  zd.unemployment_rate,
  zd.median_income,
  -- Geography
  zg.latitude,
  zg.longitude,
  zg.region_name,
  zg.department_name,
  zg.proximity_to_train_station,
  -- Quality score (0-100)
  coalesce(
    round(
      0.2 * (case when zs.price_trend_3y_pct > 10 then 80 else 50 end) +
      0.2 * (case when zrs.estimated_yield_apartment_pct > 4 then 80 else 50 end) +
      0.2 * (case when zd.unemployment_rate < 8 then 80 else 50 end) +
      0.2 * (case when zd.population_density > 50 then 70 else 50 end) +
      0.2 * (case when zd.median_income > 30000 then 70 else 50 end)
    ),
    50
  ) as zone_quality_score
from zone_stats zs
left join zone_rental_stats zrs on zs.insee_code = zrs.insee_code
left join zone_demographics zd on zs.insee_code = zd.insee_code
left join zone_geolocation zg on zs.insee_code = zg.insee_code;

-- Summary: Data freshness tracking
create table if not exists data_import_log (
  id uuid primary key default uuid_generate_v4(),
  source text not null,
  import_type text, -- 'dvf', 'perval', 'insee', 'rental'
  records_imported int,
  import_date timestamptz default now(),
  status text, -- 'success', 'partial', 'failed'
  error_message text
);

create index if not exists import_log_source on data_import_log(source);
create index if not exists import_log_date on data_import_log(import_date);
