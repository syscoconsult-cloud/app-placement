# Testing & Validation

## Pre-Scraping Checklist

- [ ] `.env.local` has `SUPABASE_SERVICE_ROLE_KEY` set
- [ ] Database migrations applied to Supabase
- [ ] `npm install` completed
- [ ] Type check passes: `npm run type-check`

---

## Testing PAP Scraper

### Step 1: Dry Run (No Database)
```bash
npm run scrape-pap:dry
```

**Expected output:**
```
🚀 Starting PAP scraper...
📍 Scraping locations: Paris, Paris
📍 Scraping Paris...
🔍 Scraping PAP: https://www.pap.fr/immobilier/recherche?location=Paris&typeID=1
Found 20 listing containers
✓ Extracted 15 properties from PAP
[DRY RUN] Would insert 15 properties
Sample property: {
  source: 'pap',
  source_url: '...',
  title: '...',
  price: 450000,
  surface_m2: 65,
  ...
}
```

If **no listings found** → selector mismatch, need to update `parseListing()`.

### Step 2: Inspect a Sample Listing
```bash
npm run scrape-pap:dry
```

Copy the sample property output and verify:
- ✅ `source_url` is valid PAP link
- ✅ `title` is readable
- ✅ `price` is numeric (≥ 10000)
- ✅ `surface_m2` is numeric (≥ 10)
- ✅ `city` extracted correctly
- ✅ `postal_code` extracted correctly

### Step 3: Live Scrape (Small Test)
```bash
npm run scrape-pap
```

Then query Supabase:
```sql
SELECT * FROM properties WHERE source = 'pap' ORDER BY created_at DESC LIMIT 5;
```

Verify:
- ✅ Rows inserted
- ✅ `is_active = true`
- ✅ `first_seen_at` = `last_seen_at` (new listings)
- ✅ `price_per_m2` calculated correctly

### Step 4: Test Stale Detection (Optional)
Manually update a property's `last_seen_at` to 8 days ago:
```sql
UPDATE properties SET last_seen_at = NOW() - INTERVAL '8 days' 
WHERE source = 'pap' LIMIT 1;
```

Run scraper again, then check:
```sql
SELECT is_active, last_seen_at FROM properties WHERE source = 'pap' AND is_active = false;
```

Should see the old listing marked as `is_active = false`.

---

## Debugging

### Enable Verbose Logging
Edit `scripts/scrape-pap.ts` and uncomment debug logs:
```typescript
console.log('Parsing element:', $el.html());
console.log('Extracted URL:', url);
console.log('Extracted title:', title);
// etc.
```

### Inspect PAP HTML Structure
```bash
# Download a sample PAP search page
curl -s 'https://www.pap.fr/immobilier/recherche?location=Paris' > pap-sample.html

# View with grep
grep -o '<article.*</article>' pap-sample.html | head -1
```

Update selectors in `parseListing()` based on actual HTML.

### Test CSS Selectors
In browser console on PAP site:
```javascript
// Find all listing containers
document.querySelectorAll('article[data-ad-id]').length

// Inspect one
document.querySelector('article[data-ad-id]')

// Find price within
document.querySelector('article[data-ad-id] .price').textContent
```

Update selectors in code accordingly.

---

## Performance Testing

### Single Location Baseline
```bash
time npm run scrape-pap
```

Target: < 3 min for Paris apartments (typical ~20-30 listings).

### Concurrent Locations
Not recommended (rate limiting is serial by design).

### Database Performance
Check insert performance:
```sql
SELECT COUNT(*) FROM properties WHERE source = 'pap' AND created_at > NOW() - INTERVAL '1 hour';
```

Should complete in < 5 seconds.

---

## Common Test Failures

### "Found 0 listing containers"
```
❌ Selector mismatch
→ Check actual PAP HTML, update selectors
→ Test with `document.querySelectorAll('actual-selector')`
```

### "Extracted 0 properties"
```
❌ Title or price extraction failed
→ Check normalizePrice() output
→ Verify `title` and `price` non-empty
→ Log intermediate parsing results
```

### "Failed to insert: Unique constraint violation"
```
❌ Property already exists (source_url duplicate)
→ Check upsert logic is working
→ Verify ON CONFLICT clause correct
```

### "Network timeout"
```
❌ PAP site slow or blocked
→ Increase axios timeout (default 15s)
→ Increase rate-limit delay
→ Retry with smaller location list
```

---

## Validation Checklist

After each scrape run:

```bash
npm run scrape-pap

# Then run these queries:
```

**Query 1: Recent inserts**
```sql
SELECT COUNT(*) as recent_count, 
       MIN(price) as min_price, 
       MAX(price) as max_price,
       AVG(surface_m2) as avg_surface
FROM properties 
WHERE source = 'pap' AND created_at > NOW() - INTERVAL '1 hour';
```

Expected: `recent_count > 0`, `min_price >= 10000`, `max_price < 100000000`, `avg_surface > 0`

**Query 2: Price/surface validation**
```sql
SELECT COUNT(*) as count,
       COUNT(CASE WHEN price_per_m2 > 0 THEN 1 END) as valid_per_m2
FROM properties 
WHERE source = 'pap' AND is_active = true;
```

Expected: `valid_per_m2 ~= count` (all properties have calculated price_per_m2)

**Query 3: Stale detection**
```sql
SELECT COUNT(*) as stale_count
FROM properties 
WHERE source = 'pap' AND is_active = false;
```

Expected: Number should increase over time as listings age.

---

## Next: Add More Sources

Once PAP scraper is validated:

1. **Copy** `pap-scraper.ts` → `seloger-scraper.ts`
2. **Update selectors** for SeLoger HTML structure
3. **Update buildSearchUrl()** for SeLoger URL format
4. **Test with dry-run** before live scraping
5. **Rotate sources** to avoid hitting same site every day

See `docs/SCRAPING.md` for details.
