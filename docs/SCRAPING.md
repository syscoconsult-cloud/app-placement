# Scraping Documentation

## Phase 2: PAP Scraper

### Overview
PAP (De Particulier à Particulier) scraper for aggregating property listings. Implements respectful scraping with configurable rate-limiting.

### Design Principles
- **Rate limiting**: 3 second delay between requests (configurable)
- **Anti-bot**: Standard User-Agent, Accept headers mimicking browser behavior
- **Respectful**: Check robots.txt, no aggressive parallel requests
- **Deduplication**: Unique constraint on (source, source_url)
- **Stale detection**: Mark listings as inactive if not seen for 7 days

### File Structure
```
lib/scrapers/
├── base-scraper.ts    # Abstract base class with rate-limiting
└── pap-scraper.ts     # PAP-specific implementation

lib/
└── property-service.ts # Database operations (upsert, mark stale)

scripts/
└── scrape-pap.ts      # CLI entry point
```

---

## Running the Scraper

### Dry Run (No Database Writes)
```bash
npm run scrape-pap:dry
```
Perfect for testing selectors, validating parsing logic, inspecting output.

### Live Scrape (Paris + Paris Houses)
```bash
npm run scrape-pap
```
Scrapes apartments and houses in Paris, inserts into `properties` table.

### Custom Locations
```bash
tsx scripts/scrape-pap.ts --location "Reims" --location "Lyon"
```

### Options
- `--dry-run` — Parse and display results without writing to DB
- `--location "City"` — Add custom city to scrape list

---

## Data Pipeline

1. **Scraper** (`pap-scraper.ts`)
   - Constructs search URL
   - Fetches HTML
   - Parses listing containers
   - Extracts: price, surface, city, postal code, type, rooms, DPE, description
   - Returns `ScrapedProperty[]`

2. **Upsert** (`property-service.ts`)
   - Upserts properties by (source, source_url) constraint
   - Calculates `price_per_m2` on insert
   - Sets `is_active = true`, `first_seen_at`, `last_seen_at`

3. **Stale Cleanup**
   - Marks listings not seen in 7 days as `is_active = false`
   - Run after each scraping cycle

---

## Troubleshooting

### Issue: "No listings found"
- **Cause**: Selectors don't match current PAP HTML
- **Fix**: 
  1. Inspect current PAP listing container HTML
  2. Update selectors in `parseListing()` method
  3. Run `--dry-run` to test without DB writes

### Issue: "Rate limit errors" or IP blocks
- **Cause**: Too many requests, PAP anti-bot triggered
- **Fix**:
  1. Increase `rateLimitMs` (default: 3000ms = 3s)
  2. Reduce number of locations being scraped
  3. Add rotating proxy if persistent blocks occur

### Issue: "Price/surface parse fails"
- **Cause**: Format changed on PAP site
- **Fix**: Check `normalizePrice()`, `normalizeSurface()` in `base-scraper.ts`
  - Should handle French formatting (€1 234,56 → 1234.56)

### Issue: "Postal code extraction fails"
- **Cause**: Location format different than expected
- **Fix**: Update `extractCity()`, `extractPostalCode()` parsing logic

---

## Next Steps

### After Validating PAP
1. Add **SeLoger** scraper (copy PAP structure, customize selectors)
2. Add **Leboncoin** scraper
3. Implement **rotation** between sources (scrape different sources on different days)

### Future: Geocoding
- Postal codes → INSEE codes (for zone_stats correlation)
- Integrate with INSEE API or PostGIS

### Future: Scheduling
- Replace manual script runs with:
  - **Supabase Cron** (Scheduled Functions)
  - **GitHub Actions** (daily workflow)
  - **External service** (EasyCron, etc.)

---

## Performance Notes

- **Single location**: ~1-2 min (depends on result count)
- **Multiple locations**: Linear time (rate-limited serially)
- **Database**: Upsert is fast (~100ms per batch of 100)
- **Bottleneck**: Network I/O (rate limiting by design)

---

## Legal Notes

- **robots.txt**: PAP likely has anti-scraping clause; use responsibly
- **Terms of Service**: PAP ToS prohibits scraping; this is for **personal use only**
- **Data usage**: Never resell or republish scraped data
- **Rate limiting**: Non-aggressive, single-threaded respect the site's resources
