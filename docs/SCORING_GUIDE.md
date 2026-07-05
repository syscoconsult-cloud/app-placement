# Deal Scoring Guide

## Overview

The app calculates a personalized "deal score" (0-100) to identify investment opportunities. Scores are based on:

1. **Discount vs Market** — How far below zone average/median?
2. **Rental Yield** — Expected annual rental income vs price
3. **Zone Dynamics** — Market trend (price appreciation/depreciation)
4. **Other Factors** — DPE, property age, location desirability

User configures weights for each component (see `scoring_weights` table).

---

## Score Components

### 1. Discount Score (0-100)

**Formula:**
```
discount_score = ((zone_median - property_price_per_m2) / zone_median) * 100
```

**Interpretation:**
- **0-25**: At market price (no discount)
- **25-50**: Moderate discount (good deal)
- **50+**: Steep discount (excellent deal or red flag)

**Example:**
```
Zone median: €9,200/m²
Property: 65m² at €450k = €6,923/m²
Discount: ((9200 - 6923) / 9200) * 100 = 24.7% ✅ GOOD DEAL

Property: 65m² at €300k = €4,615/m²
Discount: ((9200 - 4615) / 9200) * 100 = 49.8% ⚠️ RED FLAG (check why so cheap)
```

**Weight**: Typically 30-40% (primary investment criterion)

---

### 2. Rental Yield Score (0-100)

**Formula:**
```
rental_yield = (annual_rental_income / property_price) * 100
rental_yield_score = min(100, (rental_yield / 4%) * 100)
```

Where `annual_rental_income` is estimated from zone-level rental data.

**Interpretation:**
- **0-2%**: Poor yield (property appreciation play)
- **2-4%**: Moderate yield (mixed strategy)
- **4%+**: Good yield (income focus)

**Example:**
```
Property price: €450,000
Surface: 65m²
Estimated zone monthly rent: €25/m² = €1,625/month
Annual rent: €19,500
Yield: (19,500 / 450,000) * 100 = 4.33% ✅

Rental yield score: (4.33 / 4) * 100 = 108 → capped at 100
```

**Weight**: Typically 20-30% (for income-focused investors)

**Note**: Requires rental price data per zone (future enhancement).

---

### 3. Zone Dynamics Score (0-100)

**Formula:**
```
// Normalize 3-year price trend to 0-100 scale
// -30% trend = 0, 0% = 50, +30% = 100

if price_trend_3y < -30: trend_score = 0
if price_trend_3y > 30: trend_score = 100
else: trend_score = ((trend + 30) / 60) * 100
```

**Interpretation:**
- **0-30**: Declining market (risk, but opportunity for turnarounds)
- **30-70**: Stable market (predictable growth)
- **70-100**: Appreciating market (strong demand, less margin)

**Example:**
```
Paris zone: +12.5% over 3 years
Trend score: ((12.5 + 30) / 60) * 100 = 70.8% ✅ STRONG MARKET

Declining zone: -15% over 3 years
Trend score: ((-15 + 30) / 60) * 100 = 25% ⚠️ CAREFUL (recovery play?)
```

**Weight**: Typically 10-20% (varies by strategy)

---

### 4. Other Factors Score (0-100)

Qualitative factors:
- **DPE Class**: A/B = 100, C = 80, D = 60, E = 40, F/G = 20
- **Property Age**: New = 100, >50 years = 50
- **Listing Age**: Fresh = 100, >3 months = 50
- **Location Desirability**: School zones, transport, amenities

**Formula:**
```
other_score = (dpe_score * 0.4) + (age_score * 0.3) + (listing_score * 0.2) + (location_score * 0.1)
```

**Weight**: Typically 5-20% (varies by personal criteria)

---

## Total Deal Score

**Formula:**
```
total_score = (discount_score * w_discount) 
            + (rental_yield_score * w_rental)
            + (zone_dynamics_score * w_zone)
            + (other_factors_score * w_other)

where:
  w_discount + w_rental + w_zone + w_other = 1.0
```

---

## Example Scenarios

### Scenario 1: Conservative Investor (Value Focus)

**Weights:**
- Discount: 40% (main criterion)
- Rental Yield: 30%
- Zone Dynamics: 20%
- Other: 10%

**Property: Studio Paris, €450k**
- Discount Score: 65 (32% below median)
- Rental Yield: 80 (4.3% yield)
- Zone Dynamics: 71 (Paris +12.5% trend)
- Other: 75 (DPE C, built 1950s, fresh listing)

**Total Score: (65×0.40) + (80×0.30) + (71×0.20) + (75×0.10)**
**= 26 + 24 + 14.2 + 7.5 = 71.7 ✅ GOOD DEAL**

---

### Scenario 2: Growth Investor (Appreciation Focus)

**Weights:**
- Discount: 30%
- Rental Yield: 10%
- Zone Dynamics: 50% (growth market!)
- Other: 10%

**Property: Duplex Lyon, €380k**
- Discount Score: 45 (18% below avg)
- Rental Yield: 60 (2.8% yield)
- Zone Dynamics: 85 (Lyon +18% trend, hot market)
- Other: 70 (DPE B, modern, good location)

**Total Score: (45×0.30) + (60×0.10) + (85×0.50) + (70×0.10)**
**= 13.5 + 6 + 42.5 + 7 = 69 ✅ GOOD FOR GROWTH STRATEGY**

---

### Scenario 3: Red Flags (Low Scores)

**Property: House Declining Town, €120k**
- Discount Score: 95 (50% below median — why so cheap?)
- Rental Yield: 30 (very low rents, not attractive)
- Zone Dynamics: 10 (declining -25% over 3 years)
- Other: 25 (DPE F, old, been listed 6 months)

**Total Score: (95×0.40) + (30×0.30) + (10×0.20) + (25×0.10)**
**= 38 + 9 + 2 + 2.5 = 51.5 ⚠️ RISKY** (may be undervalued recovery play or money pit)

---

## Alert Thresholds

Users configure `alert_threshold` per scoring profile:

```sql
scoring_weights:
  id: '...'
  user_id: '...'
  name: 'Conservative Strategy'
  w_discount: 0.40
  w_rental: 0.30
  w_zone: 0.20
  w_other: 0.10
  alert_threshold: 70  -- Send email if score >= 70
```

**Recommended Thresholds:**
- **Conservative**: 70+ (high bar, fewer but better deals)
- **Moderate**: 65+ (balanced)
- **Aggressive**: 55+ (more deals, more noise)

---

## Implementation in Code

### 1. Calculate Scores (SQL/Edge Function)

```typescript
// In a Supabase PostgreSQL function or Edge Function
const discountScore = calculateDiscountScore(
  property.price_per_m2,
  zoneStats.avg_price_per_m2,
  zoneStats.median_price_per_m2
);

const trendScore = calculateTrendScore(zoneStats.price_trend_3y_pct);

const totalScore = 
  (discountScore * weights.weight_discount_vs_market) +
  (rentalScore * weights.weight_rental_yield) +
  (trendScore * weights.weight_zone_dynamics) +
  (otherScore * weights.weight_other_factors);

// Insert into property_scores
await db.from('property_scores').insert({
  property_id: property.id,
  scoring_weights_id: weights.id,
  discount_score: discountScore,
  zone_score: trendScore,
  total_score: totalScore,
  computed_at: new Date()
});
```

### 2. Trigger Alerts

```sql
-- Daily job: Find high-scoring, unsent properties
SELECT p.*, ps.total_score
FROM properties p
JOIN property_scores ps ON p.id = ps.property_id
JOIN scoring_weights sw ON ps.scoring_weights_id = sw.id
WHERE ps.total_score >= sw.alert_threshold
  AND NOT EXISTS (
    SELECT 1 FROM alerts_sent
    WHERE property_id = p.id
    AND user_id = sw.user_id
  )
  AND p.is_active = true
ORDER BY ps.total_score DESC;
```

### 3. Send Email Alerts

```typescript
for (const deal of highScoringDeals) {
  await sendEmail({
    to: user.email,
    subject: `New Deal: ${deal.title} (Score: ${deal.total_score})`,
    body: `
      Price: €${deal.price}
      Surface: ${deal.surface_m2}m²
      Price/m²: €${deal.price_per_m2}
      Zone avg: €${deal.zone_avg_price_per_m2}
      Discount: ${deal.discount_vs_avg}%
      
      ${deal.source_url}
    `
  });

  // Log in alerts_sent to prevent duplicates
  await db.from('alerts_sent').insert({
    property_id: deal.id,
    user_id: user.id,
    sent_at: new Date()
  });
}
```

---

## Tuning Your Strategy

### Strategy 1: Conservative Value Hunting
- **Goal**: Buy below market, hold/rent
- **Weights**: 40% discount, 30% yield, 20% zone, 10% other
- **Threshold**: 70+
- **Markets**: Stable or growing zones
- **Example Cities**: Paris, Lyon, Bordeaux

### Strategy 2: Growth Appreciation
- **Goal**: Buy in emerging markets, sell at profit
- **Weights**: 30% discount, 10% yield, 50% zone, 10% other
- **Threshold**: 65+
- **Markets**: High growth trends (+15%+)
- **Example Cities**: Toulouse, Nantes, Lille

### Strategy 3: Yield Focus (Buy-to-Rent)
- **Goal**: Maximize rental income
- **Weights**: 20% discount, 50% yield, 10% zone, 20% other
- **Threshold**: 60+
- **Markets**: High-density urban areas
- **Example Cities**: Paris, Lyon, Marseille

### Strategy 4: Contrarian Recovery
- **Goal**: Buy in declining markets, bet on recovery
- **Weights**: 50% discount, 20% yield, 20% zone, 10% other
- **Threshold**: 50+ (lower bar, higher risk)
- **Markets**: Declining zones with recovery potential
- **Example Cities**: Industrial regions, tertiary towns

---

## Next Steps

1. **Configure Your Scoring Profile**
   - Adjust weights based on your strategy
   - Set alert threshold (70 = conservative, 55 = aggressive)

2. **Start Getting Alerts**
   - System runs daily after scraping
   - Emails sent to properties matching your criteria

3. **Refine Over Time**
   - Monitor which deals pan out
   - Adjust weights based on results
   - Add new criteria (e.g., school quality, TER access)
