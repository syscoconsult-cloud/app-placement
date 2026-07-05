# Data Sources & Integration

## Overview

The app integrates multiple official and scraped data sources to provide comprehensive market analysis:

| Source | Type | Coverage | Accuracy | Update Frequency |
|--------|------|----------|----------|------------------|
| **DVF** | Government (Official) | All of France | ✅ High | Quarterly |
| **PERVAL** | Notaire (Official) | All of France | ✅ High | Quarterly |
| **PAP Scraper** | Web Scraping | France | ⚠️ Medium | Daily |

---

## 1. DVF (Demandes de Valeurs Foncières)

### What
Official French government transaction data from DGFIP (Direction Générale des Finances Publiques).

### Coverage
- All property transactions in France
- Historical data: ~15+ years
- Last 3 months lag in publication

### Data Quality
- ✅ **Verified**: Government source, legally binding
- ✅ **Complete**: All transactions registered with authorities
- ✅ **Consistent**: Standardized format across departments

### How to Use
```bash
npm run import-dvf
```

Configuration in `.env.local`:
```env
DVF_DEPARTMENTS=75,51,69,13
```

### Limitations
- Historical only (transactions already completed)
- ~3 month publication lag
- No asking prices (only sold prices)

---

## 2. PERVAL (Notaire Official Prices)

### What
Official notaire chamber (chambre des notaires) price indices and transaction summaries.

### Coverage
- Price aggregates by commune and postal code
- Multiple time periods (quarterly, yearly)
- Covers all notarized transactions

### Data Quality
- ✅ **Official**: Published by Chambre des Notaires
- ✅ **Aggregated**: Zone-level summaries (no individual transactions)
- ⚠️ **Lag**: 2-3 months behind actual transactions

### How to Use
```bash
npm run import-notaire
```

The importer:
1. Downloads PERVAL dataset from data.gouv.fr
2. Parses CSV and extracts price/m² by commune
3. Upserts to `zone_stats` table
4. Enriches existing DVF statistics

### Data Structure
```sql
zone_stats (enriched with PERVAL):
  insee_code: '75056'  -- Paris
  avg_price_per_m2: 9500
  median_price_per_m2: 9200
  price_trend_3y_pct: +12.5
  transaction_count: 1250
  updated_at: '2024-02-15'
```

---

## 3. PAP Scraper (Asking Prices)

### What
Scraped property listings from PAP (De Particulier à Particulier).

### Coverage
- Current asking prices (real-time)
- New listings daily
- Apartments & houses

### Data Quality
- ⚠️ **Asking prices** (not sold prices)
- ⚠️ **Incomplete**: Only listings on PAP site
- ✅ **Current**: Updated daily

### How to Use
```bash
npm run scrape-pap              # Live scrape
npm run scrape-pap:dry          # Test dry-run
npm run scrape-pap --location "Lyon" "Marseille"  # Custom cities
```

### Important Notes
- **Asking vs Sold**: PAP prices typically 10-20% higher than DVF sold prices
- **Deduplication**: By (source, source_url)
- **Stale Detection**: Marks listings as inactive after 7 days
- **Rate Limiting**: 3 seconds between requests (respectful)

---

## Comparison: DVF vs PERVAL vs PAP

```
DVF (Government Transactions)
├─ Data: Actual sold prices
├─ Source: DGFIP official register
├─ Lag: ~3 months
├─ Example: "Property sold Jan 2024 for €400k"
└─ Best for: Market baseline, trends

PERVAL (Notaire Aggregates)
├─ Data: Zone-level price indices
├─ Source: Chambre des Notaires
├─ Lag: ~2-3 months
├─ Example: "Paris avg €9500/m² in Q4 2023"
└─ Best for: Reference prices, zone comparison

PAP (Scraped Asking Prices)
├─ Data: Current asking prices
├─ Source: Web scraping
├─ Lag: Real-time (daily refresh)
├─ Example: "Apartment listed for €450k today"
└─ Best for: Deal identification, opportunity alerts
```

---

## Data Pipeline & Enrichment

### Step 1: Import Official Data
```bash
npm run import-dvf         # DVF transactions (phase 1)
npm run import-notaire     # PERVAL zone stats (phase 2.5)
```

### Step 2: Scrape Asking Prices
```bash
npm run scrape-pap         # PAP listings (phase 2)
```

### Step 3: Enrich & Compare
```bash
npm run compare-prices     # Generate comparison report
```

This shows:
- DVF avg price/m² for city
- PERVAL zone statistics
- PAP scraped listings
- Price gaps & insights

### Step 4: Calculate Deal Scores
Properties enriched with zone data:
```typescript
property = {
  id: '...',
  title: 'Studio Paris',
  price: 450000,
  surface_m2: 65,
  price_per_m2: 6923,
  
  // Enrichment
  zone_avg_price_per_m2: 9500,
  zone_median_price_per_m2: 9200,
  discount_vs_avg: -27%,  // 27% below avg (GOOD!)
  discount_vs_median: -25% // 25% below median
}
```

---

## Database Schema: Zone Stats

Enhanced with data from all sources:

```sql
zone_stats (
  insee_code: '75056',
  postal_code: '75000',
  
  -- From DVF
  dvf_avg_price_per_m2: 9500,
  dvf_median_price_per_m2: 9200,
  dvf_transaction_count: 1250,
  dvf_last_update: '2024-02-15',
  
  -- From PERVAL
  notaire_avg_price_per_m2: 9480,
  notaire_median_price_per_m2: 9180,
  
  -- Computed
  avg_price_per_m2: 9490,  -- Consolidated
  median_price_per_m2: 9190,
  price_trend_3y_pct: +12.5,
  
  updated_at: '2024-02-15'
);
```

---

## Troubleshooting

### DVF Import Fails
```bash
npm run import-dvf
# Error: "No valid records"
```
**Fix**: Check `.env.local` has valid `DVF_DEPARTMENTS`.

### PERVAL Download Times Out
```bash
npm run import-notaire
# Error: "Timeout downloading PERVAL"
```
**Fix**: data.gouv.fr might be slow. Retry or increase timeout.

### PAP Scraper Returns 0 Listings
```bash
npm run scrape-pap:dry
# Found 0 listing containers
```
**Fix**: PAP HTML structure changed. Update CSS selectors in `pap-scraper.ts`.

### Price Comparison Shows No DVF Data
```bash
npm run compare-prices
# "No price data available for this city"
```
**Fix**: DVF data may not be imported yet. Run `npm run import-dvf` first.

---

## Next Steps

### Real-Time Updates
- Schedule `import-dvf` monthly (DVF updates quarterly)
- Schedule `import-notaire` monthly (PERVAL updates quarterly)
- Schedule `scrape-pap` daily (get new listings)

### Geographic Enrichment
- Map postal_code → insee_code (improve zone matching)
- Add departement & region fields for filtering

### Data Quality
- Validate price outliers (detect scraper errors)
- Cross-check DVF vs PERVAL for consistency
- Flag suspicious asking prices (2x above market)

---

## Legal & Ethical Notes

- **DVF**: Public government data, freely available
- **PERVAL**: Published by notaire chamber, aggregated public data
- **PAP**: Terms of Service prohibit scraping; personal use only
  - Never resell or republish
  - Respectful rate-limiting (3s delays)
  - Single-threaded, non-aggressive requests
