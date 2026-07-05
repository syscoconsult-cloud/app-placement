# Real Estate Sourcing App — Personal Investment Opportunity Analysis

## Project Overview

Personal web application for real estate sourcing and investment opportunity analysis. Aggregates property listings from multiple sources, calculates a personalized "deal score," and alerts when properties match investment criteria.

**Scope**: Personal use only. No commercialization or public service.

---

## Technology Stack

- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Backend / DB**: Supabase (Postgres, Auth, Edge Functions)
- **Scraping**: Node.js module (Playwright/Cheerio), via Edge Functions or scheduled tasks
- **Email Alerts**: Resend or SendGrid
- **Deployment**: Vercel (frontend) + Supabase (backend)

---

## Database Schema (Supabase / Postgres)

### Core Tables

#### `properties` — Aggregated listings
- `id` (uuid, pk)
- `source` (text) — e.g., 'pap', 'leboncoin', 'dvf'
- `source_url` (text, unique per source)
- `title`, `price`, `surface_m2`, `price_per_m2` (calculated)
- `city`, `postal_code`, `insee_code`
- `property_type` (text) — apartment / house / land
- `rooms` (int, nullable), `dpe_class` (text, nullable)
- `description` (text, nullable)
- `raw_data` (jsonb) — raw payload
- `first_seen_at`, `last_seen_at` (timestamptz)
- `is_active` (boolean) — false when listing disappears

#### `dvf_transactions` — Public reference data (DVF)
- `id` (uuid, pk)
- `insee_code`, `postal_code`, `transaction_date`, `price`, `surface_m2`
- `price_per_m2` (calculated)
- `property_type`
- Imported from data.gouv.fr (one-shot script + periodic refresh)

#### `zone_stats` — Aggregated market metrics (refreshed periodically)
- `insee_code` (text, pk)
- `avg_price_per_m2`, `median_price_per_m2`
- `price_trend_3y_pct` — 3-year evolution
- `transaction_count`
- `updated_at` (timestamptz)

#### `scoring_weights` — User configuration (RLS by user_id)
- `id` (uuid, pk)
- `user_id` (uuid, fk auth.users)
- `name` (text) — strategy name
- `weight_discount_vs_market`, `weight_rental_yield`, `weight_zone_dynamics`, `weight_other_factors` (numeric, 0-1)
- `is_active` (boolean)
- `alert_threshold` (numeric)

#### `property_scores` — Computed scores (per property × scoring profile)
- `id` (uuid, pk)
- `property_id`, `scoring_weights_id` (fks)
- `discount_score`, `yield_score`, `zone_score`, `other_score` (numeric)
- `total_score` (numeric)
- `computed_at` (timestamptz)

#### `alerts_sent` — Alert history (RLS by user_id, prevents duplicates)
- `id` (uuid, pk)
- `property_id`, `user_id` (fks)
- `sent_at` (timestamptz)

---

## Development Roadmap

### Phase 1: DVF Module (START HERE)
1. **Import script**: Download & parse DVF files from data.gouv.fr (configurable departments)
2. **Zone stats**: Calculate & upsert aggregates (avg/median price/m², 3-year trend by INSEE code)
3. **Validation**: Manual spot-check of imported data

### Phase 2: Scraper (Single Source)
1. Start with PAP (less aggressive anti-bot than Leboncoin)
2. Rate-limit reasonably; respect robots.txt
3. Deduplicate by source URL
4. Mark `is_active = false` for stale listings (daily cron)

### Phase 3: Scoring Engine
1. SQL function computing: discount, rental yield, zone dynamics, other factors
2. Aggregate into `property_scores` for each active property × active profile

### Phase 4: Alert System
1. Daily job: identify high-scoring properties, send email via Resend
2. Log sent alerts to prevent duplicates

### Phase 5: Frontend (Next.js Dashboard)
1. Auth (Supabase)
2. Property list + filters
3. Detail view + map (Mapbox/Leaflet)
4. Scoring weights configuration
5. Alert history

---

## Legal & Technical Guardrails

- **Scraping pace**: Personal use only; non-aggressive, reasonable delays between requests
- **Anti-bot**: If a site blocks, stop (don't bypass CAPTCHAs or protections)
- **Data sources**: Prioritize legal public data (DVF, cadastre) over scraping
- **No public exposure**: Strictly personal use; never sell or expose publicly

---

## First Implementation: DVF Import

### Overview
Ingest historical property transaction data from data.gouv.fr DVF (Demandes de Valeurs Foncières) to establish baseline market prices by zone. This unlocks value immediately without needing any scraping.

### Steps
1. **Create database schema** (tables: `dvf_transactions`, `zone_stats`)
2. **Download DVF CSV** for target departments (configurable)
3. **Parse & import** into Postgres
4. **Compute zone stats** (aggregates by INSEE code)
5. **Test** with manual spot-check

### Key Files
- `scripts/import-dvf.ts` — One-shot import script
- `supabase/migrations/001_init_dvf_schema.sql` — Schema DDL
- `.env.local` — Supabase credentials

---

## Current Branch

All work on: `claude/real-estate-sourcing-app-ym7as5`

Commit & push when each phase completes.
