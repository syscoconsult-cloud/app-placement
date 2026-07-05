# Dashboard Guide — Real Estate Investment Analysis

## Overview

Complete deal analysis dashboard showing properties with AI-calculated deal scores.

**What you see:**
- Property list with prices, sizes, location
- Deal scores (0-100) combining all market data
- Zone comparisons (price, rental yield, trends)
- Advanced filters (price, location, score, yield)
- Real-time statistics

---

## Getting Started

### 1. Populate Database

```bash
# Import all official data
npm run import-all-data

# Output:
# ✅ PERVAL: 2,856 zones
# ✅ INSEE:  36,500 communes
# ✅ ANIL:   3,200 rental zones

# Scrape current listings (daily)
npm run scrape-pap

# Output:
# ✓ Extracted 25 properties from PAP
```

### 2. Calculate Deal Scores

```bash
npm run compute-scores

# Output:
# 📊 Computing property deal scores...
# ✅ Scoring completed
# Properties scored: 25
```

### 3. Start Dashboard

```bash
npm run dev

# Open: http://localhost:3000
```

---

## Dashboard Layout

### Top: Statistics Summary
```
🏠 Total Properties    💰 Avg Price      📊 Avg Score
25                     €450k             68.3

⭐ Excellent Deals     📐 Avg Price/m²   🏘️ Avg Rental Yield
7                      €8,500            3.8%
```

### Left Sidebar: Filters
- **City** — Filter by location
- **Price Range** — Min/max budget
- **Deal Score** — Slider (0-100)
- **Property Type** — Apartment/House/Land
- **Rental Yield** — Min expected return

### Main: Property Grid
Cards showing:
- **Title** + Link to listing
- **Price** (€450k) + Size (65m²) + Price/m²
- **Deal Score Badge** (color-coded: green=great, red=poor)
- **Zone Comparison** (price vs market, discount %)
- **3-Year Trend** (market appreciation)
- **Score Breakdown** (4 components: 40+25+20+15)
- **Rental Yield** (if available)
- **Tags** (Type: Apartment, DPE: C)

---

## Deal Score Explained

### Total Score = 0-100

**Components (weighted):**
1. **Discount vs Market (40%)** — How far below zone median?
   - 0 = Premium (above market)
   - 50 = At market price
   - 100 = 30%+ below market

2. **Rental Yield (25%)** — Expected annual rent return
   - 0 = 0% yield
   - 50 = 2% yield
   - 100 = 4%+ yield

3. **Zone Dynamics (20%)** — Market appreciation trend
   - 0 = -30% trend (declining)
   - 50 = 0% trend (stable)
   - 100 = +30% trend (appreciating)

4. **Location Quality (15%)** — Demographics + infrastructure
   - Factors: DPE, listing freshness, employment, density

### Interpretation

| Score | Color | Meaning |
|-------|-------|---------|
| **70-100** | 🟢 Green | Excellent deal (good discount + good zone) |
| **60-70** | 🟡 Yellow | Good deal (moderate discount + decent zone) |
| **50-60** | ⚪ Gray | Average deal (balanced factors) |
| **<50** | 🔴 Red | Poor deal or red flag (expensive or declining zone) |

### Example

**Property: Studio Paris €450k, 65m²**
- Zone median: €9,200/m²
- Property: €6,923/m²
- **Discount Score: 65** (25% below median = GOOD)
- **Rental Yield: 70** (4% yield = good)
- **Zone Trend: 71** (Paris +12.5% = strong)
- **Quality: 75** (DPE C, fresh, good location)
- **Total: 69** (Good deal 🟡)

---

## How to Use Filters

### By Price
```
Min: €300,000
Max: €600,000
→ Shows only properties in range
```

### By Score
```
Score: 65+
→ Shows deals >= 65 (good deals only)
```

### By City
```
City: Paris
→ Filter by specific location
```

### By Rental Yield
```
Yield: 3.5%
→ Show income-focused properties
```

### Multiple Filters
```
Paris + €400k-€600k + Score 65+ + Apartments
→ High-quality apartment deals in Paris budget range
```

---

## What the Data Shows

### Zone Comparison Section (for each property)

```
Zone Average:   €9,500/m²
Your Property:  €6,923/m² ← Below average
Discount:       -25%      ← Good bargain!

3-Year Trend:   +12.5%    ← Market appreciating
```

**What this means:**
- You're buying 25% below the zone average
- The zone has been appreciating for 3 years
- Good combination for value + growth

### Score Breakdown (small cards)

```
Discount: 65    ← Strong bargain
Yield:    70    ← Good rental income
Zone:     71    ← Growing market
Quality:  75    ← Good location/DPE
```

Click individual scores to understand each component.

---

## Advanced: Custom Scoring

Currently using default weights:
- 40% Discount
- 25% Rental Yield
- 20% Zone Dynamics
- 15% Quality

**Future**: Customize weights by investment strategy:

```
Strategy: Income Focus
- Discount: 20%
- Rental Yield: 50% ← High weight
- Zone Dynamics: 15%
- Quality: 15%
```

```
Strategy: Growth Focus
- Discount: 30%
- Rental Yield: 10%
- Zone Dynamics: 50% ← High weight
- Quality: 10%
```

---

## Daily Workflow

### Morning (after overnight scraping)
```bash
# Properties scraped automatically? Set up cron job:
# Run daily at 6am: npm run scrape-pap

# Then compute fresh scores:
npm run compute-scores

# Check dashboard for new deals
npm run dev
# Open http://localhost:3000
```

### Review Properties
```
1. Sort by deal score (highest first)
2. Filter by your criteria (price range, yield)
3. Click links to verify on original site
4. Bookmark interesting properties
5. Track which ones sell (to validate scoring)
```

### Adjust Strategy
```
"That deal didn't pan out..."
→ Review its original score
→ Adjust scoring weights
→ Recalculate (npm run compute-scores)
→ Compare with results
```

---

## Technical Details

### API Endpoints

**GET /api/properties**
```
Query parameters:
- city: string (filter by city)
- minPrice: number
- maxPrice: number
- minScore: number (0-100)
- propertyType: string (apartment|house|land)
- minYield: number
- limit: number (default 50)

Response:
{
  count: 25,
  data: [
    {
      id: "...",
      title: "Studio Paris",
      price: 450000,
      total_score: 69,
      discount_score: 65,
      ...
    }
  ]
}
```

**GET /api/stats**
```
Response:
{
  totalProperties: 25,
  averagePrice: 450000,
  averageScore: 68.3,
  excellentDeals: 7,
  avgPricePerM2: 8500,
  avgRentalYield: 3.8
}
```

### Database Views

**zone_complete_profile** (SQL view)
- Combines all data sources
- One row per zone (INSEE code)
- Includes: prices, rental, demographic, geographic data
- Zone quality score (0-100)

---

## Performance Notes

- **Load Time**: ~1-2s for 50 properties (Supabase query + enrichment)
- **Filters**: Client-side (instant)
- **Sorting**: By score (highest first)
- **Updates**: Daily via `npm run scrape-pap` + `npm run compute-scores`

---

## Troubleshooting

### No properties showing
```
❌ "No properties found"
→ Run: npm run scrape-pap
→ Then: npm run compute-scores
→ Then refresh dashboard
```

### Scores all 0 or 50
```
❌ All properties have same score
→ Zone data missing
→ Run: npm run import-all-data
→ Verify zone_stats has data:
   SELECT COUNT(*) FROM zone_stats;
```

### Filter not working
```
❌ Filter changes don't update results
→ Check browser console for errors
→ Verify API endpoint responds:
   curl http://localhost:3000/api/properties?city=Paris
```

---

## Next: Phase 4 (Alerts)

Once dashboard is working:

```bash
# Next feature: Email alerts
# When: Property score >= your threshold
# How: Daily job finds high-scoring deals
# Where: Sends email via Resend

# Coming soon!
npm run send-alerts  # Not yet implemented
```

---

## Summary

✅ **You now have:**
- Dashboard showing all properties
- AI-calculated deal scores
- Advanced filtering (price, location, score)
- Zone comparisons (vs market)
- Real-time statistics
- Data from 6 official sources

📊 **Dashboard shows:**
- Deal quality at a glance (score + color)
- Discount vs market (bargain indicator)
- Rental yield potential (income analysis)
- Zone trends (growth indicator)
- Location factors (desirability)

🚀 **Next steps:**
- Run scripts daily: `npm run scrape-pap && npm run compute-scores`
- Monitor new deals matching your criteria
- Phase 4: Email alerts for high-scoring deals
- Phase 5: Map view + advanced analytics
