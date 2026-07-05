# Development Guide — Real Estate Sourcing App

## Project Setup

### Prerequisites
- Node.js 18+ and npm
- Supabase account and project
- GitHub access

### Local Setup

1. **Clone and install**
   ```bash
   git clone https://github.com/syscoconsult-cloud/app-placement.git
   cd app-placement
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env.local
   ```
   Fill in Supabase credentials:
   - `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Public anon key (safe for browser)
   - `SUPABASE_SERVICE_ROLE_KEY`: Service role key (keep secret, server-only)

3. **Apply database migrations**
   - Via Supabase dashboard: Go to SQL Editor, paste content of `supabase/migrations/001_init_dvf_schema.sql`
   - Or via Supabase CLI: `supabase db push`

4. **Start development server**
   ```bash
   npm run dev
   ```
   Open http://localhost:3000

---

## Phase 1: DVF Import Module

### Goal
Import French property transaction data (DVF) to establish market baseline for zones.

### Steps Completed
- ✅ Database schema created (`dvf_transactions`, `zone_stats`)
- ✅ DVF import script scaffolded (`scripts/import-dvf.ts`)
- ✅ Project structure initialized (Next.js 14 + Supabase)

### Next Steps

1. **Test DVF import locally**
   ```bash
   # First, make sure .env.local has SUPABASE_SERVICE_ROLE_KEY set
   npm run import-dvf
   ```
   - Downloads DVF CSV files for configured departments (default: 75 — Paris, 51 — Reims)
   - Parses and inserts into `dvf_transactions`
   - Computes zone statistics (average, median, 3-year trend)

2. **Validate imported data**
   - Query Supabase dashboard: `SELECT * FROM dvf_transactions LIMIT 10`
   - Check zone stats: `SELECT * FROM zone_stats`
   - Compare results with public data sources

3. **Troubleshooting**
   - If CSV parsing fails, check DVF file format (header row expected)
   - If Supabase insert fails, verify `SUPABASE_SERVICE_ROLE_KEY` permissions
   - Check logs: `npm run import-dvf 2>&1 | tee import.log`

---

## Phase 2: PAP Scraper

### Status: COMPLETED ✅
Scrapes PAP (De Particulier à Particulier) property listings with respectful rate-limiting.

### Running the Scraper

**Dry run** (test without database writes):
```bash
npm run scrape-pap:dry
```

**Live scrape** (Paris apartments + houses):
```bash
npm run scrape-pap
```

**Custom locations**:
```bash
tsx scripts/scrape-pap.ts --location "Reims" --location "Lyon"
```

### Key Features
- ✅ Rate-limited requests (3s between requests)
- ✅ HTML parsing with Cheerio
- ✅ Deduplication by source URL
- ✅ Automatic stale detection (7-day threshold)
- ✅ Structured property extraction (price, surface, city, DPE, etc.)

### Files
- `lib/scrapers/base-scraper.ts` — Abstract base with rate-limiting
- `lib/scrapers/pap-scraper.ts` — PAP-specific HTML parsing
- `lib/property-service.ts` — Database operations (upsert, mark stale)
- `scripts/scrape-pap.ts` — CLI entry point
- `docs/SCRAPING.md` — Architecture & troubleshooting
- `docs/TESTING.md` — Testing & validation guide

### Testing & Validation
See `docs/TESTING.md` for:
- Pre-scraping checklist
- Dry-run validation
- Database verification
- Common failure debugging

---

## Phase 2.5: Notaire + Government + INSEE + Rental Data

### Status: COMPLETED ✅

Enriches market analysis with official sources: notaire prices, demographics, geolocation, rental data.

### Features
- ✅ **PERVAL** — Notaire official price indices
- ✅ **INSEE** — Demographics, employment, income, urbanization
- ✅ **RDNA/BAN** — Geolocation, proximity to transport/highways/airports
- ✅ **ANIL/CLAMEUR** — Rental prices, rental evolution
- ✅ **Data enrichment** — Link properties to complete zone profiles
- ✅ **Price comparison** — DVF vs Notaire vs PAP scraper
- ✅ **Unified view** — `zone_complete_profile` SQL view

### Running the Imports

**One-time: Import all data sources**
```bash
npm run import-all-data
```
This imports:
- DVF transactions (Phase 1)
- PERVAL notaire prices
- INSEE demographics
- ANIL rental data
- CLAMEUR rental evolution

**Single sources (if needed)**
```bash
npm run import-dvf          # DVF only
npm run import-notaire      # PERVAL only
```

**Validation & analysis**
```bash
npm run compare-prices      # Price source comparison
```

### Key Files
- `lib/data-sources/notaire-importer.ts` — PERVAL import
- `lib/data-sources/insee-importer.ts` — INSEE demographics + geolocation
- `lib/data-sources/rental-importer.ts` — ANIL/CLAMEUR rental data
- `lib/data-enrichment.ts` — Property enrichment with zone data
- `scripts/import-all-data.ts` — Master import script (all sources)
- `scripts/compare-price-sources.ts` — Price validation report
- `supabase/migrations/002_add_rental_and_census_data.sql` — Enhanced schema
- `docs/DATA_SOURCES.md` — Data source overview
- `docs/ENRICHED_DATA.md` — Complete enriched data guide
- `docs/SCORING_GUIDE.md` — Deal scoring methodology

### What It Does

1. **Import PERVAL** — Official notaire price indices by zone
2. **Import Government Data** — Other real estate datasets from data.gouv.fr
3. **Enrich Zone Stats** — Consolidate prices from multiple sources
4. **Link Properties to Zones** — Calculate discount vs market price
5. **Support Scoring** — Provide reference data for deal scoring

### Example
```bash
npm run import-notaire
# ✅ Imported 2,856 zone statistics from PERVAL

npm run compare-prices
# 📊 Paris
#   DVF Avg: €9,500/m²
#   PERVAL: €9,480/m²
#   PAP Avg: €11,200/m² (asking prices)
#   Gap: +17.9% (typical, PAP asking vs sold)
```

---

## Next Phases

### Phase 3: Add More Scrapers (Future)
- SeLoger scraper (copy PAP structure, customize selectors)
- Leboncoin scraper
- Rotate between sources to avoid detection

### Phase 4: Scoring Engine (Future)
- Compute discount, yield, zone dynamics, other factors
- Store in `property_scores`

### Phase 4: Alert System (Future)
- Daily job to identify high-scoring properties
- Send email via Resend

### Phase 5: Frontend (Future)
- Dashboard with property list, filters, detail view
- Configuration UI for scoring weights
- Alert history viewer

---

## Common Commands

```bash
npm run dev          # Start dev server
npm run build        # Build for production
npm run start        # Run production build
npm run lint         # Run ESLint
npm run type-check   # Run TypeScript type check
npm run import-dvf   # Run DVF import script
```

---

## Deployment

### Frontend (Vercel)
```bash
git push origin claude/real-estate-sourcing-app-ym7as5
# Vercel auto-deploys on push (if configured)
```

### Database (Supabase)
- Migrations applied manually via dashboard or CLI
- Environment variables set in Vercel project settings

---

## Project Structure

```
app-placement/
├── app/                      # Next.js App Router pages
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── components/               # React components (future)
├── lib/                       # Utilities
│   └── supabase.ts          # Supabase client config
├── scripts/
│   └── import-dvf.ts        # DVF import script
├── supabase/
│   └── migrations/
│       └── 001_init_dvf_schema.sql
├── public/                   # Static assets (future)
├── .env.example              # Environment template
├── CLAUDE.md                 # Project brief
├── DEVELOPMENT.md            # This file
├── next.config.js
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

---

## Notes

- All work on branch: `claude/real-estate-sourcing-app-ym7as5`
- Code review & testing before each commit
- Small, focused commits with clear messages
