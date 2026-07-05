import { supabaseAdmin } from './supabase';

export interface PropertyWithZoneData {
  id: string;
  title: string;
  price: number;
  surface_m2?: number;
  price_per_m2?: number;
  insee_code?: string;
  postal_code?: string;
  // Zone enrichment
  zone_avg_price_per_m2?: number;
  zone_median_price_per_m2?: number;
  zone_price_trend_3y_pct?: number;
  // Derived metrics
  discount_vs_avg?: number; // % below zone average
  discount_vs_median?: number; // % below zone median
}

/**
 * Enrich properties with zone-level statistics
 * Links postal_code/insee_code to zone_stats for market comparison
 */
export async function enrichPropertiesWithZoneData(
  properties: any[]
): Promise<PropertyWithZoneData[]> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  const enriched: PropertyWithZoneData[] = [];

  for (const prop of properties) {
    try {
      // Find zone stats by INSEE code (preferred) or postal code
      let zoneStats: any = null;

      if (prop.insee_code) {
        const { data } = await supabaseAdmin
          .from('zone_stats')
          .select('*')
          .eq('insee_code', prop.insee_code)
          .single();
        zoneStats = data;
      }

      if (!zoneStats && prop.postal_code) {
        // Fallback: search by postal code (less accurate)
        const { data } = await supabaseAdmin
          .from('zone_stats')
          .select('*')
          .like('postal_code', `${prop.postal_code}%`)
          .limit(1)
          .single();
        zoneStats = data;
      }

      const enrichedProp: PropertyWithZoneData = {
        id: prop.id,
        title: prop.title,
        price: prop.price,
        surface_m2: prop.surface_m2,
        price_per_m2: prop.price_per_m2,
        insee_code: prop.insee_code,
        postal_code: prop.postal_code,
      };

      if (zoneStats) {
        enrichedProp.zone_avg_price_per_m2 = zoneStats.avg_price_per_m2;
        enrichedProp.zone_median_price_per_m2 = zoneStats.median_price_per_m2;
        enrichedProp.zone_price_trend_3y_pct = zoneStats.price_trend_3y_pct;

        // Calculate discount percentages
        if (prop.price_per_m2 && zoneStats.avg_price_per_m2) {
          enrichedProp.discount_vs_avg = ((zoneStats.avg_price_per_m2 - prop.price_per_m2) /
            zoneStats.avg_price_per_m2) * 100;
        }

        if (prop.price_per_m2 && zoneStats.median_price_per_m2) {
          enrichedProp.discount_vs_median = ((zoneStats.median_price_per_m2 - prop.price_per_m2) /
            zoneStats.median_price_per_m2) * 100;
        }
      }

      enriched.push(enrichedProp);
    } catch (err) {
      // On error, return property without enrichment
      enriched.push({
        id: prop.id,
        title: prop.title,
        price: prop.price,
        surface_m2: prop.surface_m2,
        price_per_m2: prop.price_per_m2,
        insee_code: prop.insee_code,
        postal_code: prop.postal_code,
      });
    }
  }

  return enriched;
}

/**
 * Get market statistics for a zone
 * Used to display reference prices in UI
 */
export async function getZoneMarketStats(inseeCode: string) {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  const { data, error } = await supabaseAdmin
    .from('zone_stats')
    .select('*')
    .eq('insee_code', inseeCode)
    .single();

  if (error) {
    console.warn(`Zone stats not found for INSEE ${inseeCode}`);
    return null;
  }

  return data;
}

/**
 * Calculate discount score component
 * Part of overall deal score
 */
export function calculateDiscountScore(
  propertyPricePerM2: number,
  zoneAvgPricePerM2: number,
  zoneMedianPricePerM2: number
): number {
  if (!zoneAvgPricePerM2 || !zoneMedianPricePerM2) return 0;

  // Discount vs both average and median
  const discountVsAvg = ((zoneAvgPricePerM2 - propertyPricePerM2) / zoneAvgPricePerM2) * 100;
  const discountVsMedian = ((zoneMedianPricePerM2 - propertyPricePerM2) / zoneMedianPricePerM2) * 100;

  // Average discount, capped at 0-100 range
  const avgDiscount = (discountVsAvg + discountVsMedian) / 2;
  return Math.max(0, Math.min(100, avgDiscount));
}

/**
 * Calculate trend score component
 * Positive trend = higher score (good investment)
 */
export function calculateTrendScore(priceChange3yPct: number): number {
  // Normalize to 0-100 range
  // Trend between -30% and +30% is normal, outside is extreme
  if (priceChange3yPct < -30) return 0;
  if (priceChange3yPct > 30) return 100;

  // Linear scaling: -30% → 0, 0% → 50, +30% → 100
  return ((priceChange3yPct + 30) / 60) * 100;
}
