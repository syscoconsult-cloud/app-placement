import { supabaseAdmin } from './supabase';

export interface ScoringInput {
  property_id: string;
  price_per_m2: number;
  surface_m2?: number;
  dpe_class?: string;
  days_listed?: number;
  zone_avg_price_per_m2?: number;
  zone_median_price_per_m2?: number;
  zone_price_trend_3y?: number;
  avg_rental_per_m2?: number;
  unemployment_rate?: number;
  population_density?: number;
}

export interface ScoreBreakdown {
  discount_score: number;
  yield_score: number;
  zone_score: number;
  quality_score: number;
  total_score: number;
}

export class ScoringEngine {
  /**
   * Calculate discount score component (0-100)
   * How much below zone median price?
   */
  static calculateDiscountScore(
    propertyPricePerM2: number,
    zoneMedianPricePerM2?: number
  ): number {
    if (!zoneMedianPricePerM2 || zoneMedianPricePerM2 <= 0) return 50; // Neutral if no reference

    const discount = ((zoneMedianPricePerM2 - propertyPricePerM2) / zoneMedianPricePerM2) * 100;

    // Normalize to 0-100:
    // -30% to median = 0 (premium)
    // At median = 50
    // 30%+ below median = 100 (great deal, or red flag?)
    return Math.max(0, Math.min(100, 50 + discount / 0.6));
  }

  /**
   * Calculate rental yield score (0-100)
   * Based on estimated rental income vs property price
   */
  static calculateYieldScore(
    rentalPricePerM2?: number,
    surfaceM2?: number,
    propertyPrice?: number
  ): number {
    if (!rentalPricePerM2 || !surfaceM2 || !propertyPrice || propertyPrice <= 0) {
      return 50; // Neutral if missing data
    }

    const monthlyRent = rentalPricePerM2 * surfaceM2;
    const annualRent = monthlyRent * 12;
    const yieldPct = (annualRent / propertyPrice) * 100;

    // Normalize: 0% yield = 0, 4% yield = 100, 8%+ = 100
    return Math.max(0, Math.min(100, (yieldPct / 4) * 100));
  }

  /**
   * Calculate zone dynamics score (0-100)
   * Based on 3-year price trend
   */
  static calculateZoneScore(priceTrend3y?: number): number {
    if (priceTrend3y === null || priceTrend3y === undefined) return 50;

    // Normalize trend: -30% = 0, 0% = 50, +30% = 100
    const normalized = 50 + (priceTrend3y / 0.6) * 50;
    return Math.max(0, Math.min(100, normalized));
  }

  /**
   * Calculate quality score (0-100)
   * Based on DPE, listing freshness, demographic factors
   */
  static calculateQualityScore(
    dpeClass?: string,
    daysListed?: number,
    unemploymentRate?: number,
    populationDensity?: number
  ): number {
    let score = 50; // Base neutral

    // DPE score (40% weight)
    if (dpeClass) {
      const dpeScores: Record<string, number> = {
        'A': 100, 'B': 90, 'C': 70, 'D': 50, 'E': 30, 'F': 15, 'G': 0,
      };
      const dpeScore = dpeScores[dpeClass] || 50;
      score += (dpeScore - 50) * 0.4;
    }

    // Listing freshness (30% weight) - newer is better
    if (daysListed !== undefined) {
      const freshnessScore = Math.max(0, 100 - (daysListed / 180) * 100); // 180 days = very old
      score += (freshnessScore - 50) * 0.3;
    }

    // Employment/demographics (30% weight)
    if (unemploymentRate !== undefined) {
      const employmentScore = Math.max(0, 100 - (unemploymentRate / 15) * 100); // 15% = very poor
      score += (employmentScore - 50) * 0.15;
    }

    if (populationDensity !== undefined) {
      const densityScore = Math.min(100, (populationDensity / 5000) * 100); // 5000/km² = good
      score += (densityScore - 50) * 0.15;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate total deal score (0-100)
   * Weighted combination of all components
   */
  static calculateTotalScore(
    discountScore: number,
    yieldScore: number,
    zoneScore: number,
    qualityScore: number,
    weights?: {
      discount?: number;
      yield?: number;
      zone?: number;
      quality?: number;
    }
  ): number {
    const w = {
      discount: weights?.discount ?? 0.4,
      yield: weights?.yield ?? 0.25,
      zone: weights?.zone ?? 0.2,
      quality: weights?.quality ?? 0.15,
    };

    // Normalize weights
    const total = w.discount + w.yield + w.zone + w.quality;
    const totalScore =
      (discountScore * (w.discount / total)) +
      (yieldScore * (w.yield / total)) +
      (zoneScore * (w.zone / total)) +
      (qualityScore * (w.quality / total));

    return Math.max(0, Math.min(100, totalScore));
  }

  /**
   * Score a single property
   */
  static scoreProperty(input: ScoringInput): ScoreBreakdown {
    const discountScore = this.calculateDiscountScore(input.price_per_m2, input.zone_median_price_per_m2);
    const yieldScore = this.calculateYieldScore(input.avg_rental_per_m2, input.surface_m2,
      input.price_per_m2 && input.surface_m2 ? input.price_per_m2 * input.surface_m2 : undefined);
    const zoneScore = this.calculateZoneScore(input.zone_price_trend_3y);
    const qualityScore = this.calculateQualityScore(
      input.dpe_class,
      input.days_listed,
      input.unemployment_rate,
      input.population_density
    );

    const totalScore = this.calculateTotalScore(discountScore, yieldScore, zoneScore, qualityScore);

    return {
      discount_score: Math.round(discountScore * 10) / 10,
      yield_score: Math.round(yieldScore * 10) / 10,
      zone_score: Math.round(zoneScore * 10) / 10,
      quality_score: Math.round(qualityScore * 10) / 10,
      total_score: Math.round(totalScore * 10) / 10,
    };
  }

  /**
   * Batch score properties and store in database
   */
  static async scoreAndStoreProperties(): Promise<number> {
    if (!supabaseAdmin) throw new Error('Supabase admin not configured');

    try {
      // Fetch all active properties with zone data
      const { data: properties, error: fetchError } = await supabaseAdmin
        .from('properties')
        .select(`
          id,
          price,
          surface_m2,
          price_per_m2,
          dpe_class,
          created_at,
          postal_code,
          insee_code
        `)
        .eq('is_active', true)
        .limit(1000);

      if (fetchError) throw fetchError;
      if (!properties || properties.length === 0) return 0;

      let scoredCount = 0;

      for (const prop of properties) {
        try {
          // Fetch zone data
          const { data: zoneData } = await supabaseAdmin
            .from('zone_complete_profile')
            .select('*')
            .eq('insee_code', prop.insee_code)
            .single();

          const daysListed = prop.created_at
            ? Math.floor((Date.now() - new Date(prop.created_at).getTime()) / (1000 * 60 * 60 * 24))
            : 0;

          // Score property
          const score = this.scoreProperty({
            property_id: prop.id,
            price_per_m2: prop.price_per_m2 || (prop.price / (prop.surface_m2 || 1)),
            surface_m2: prop.surface_m2,
            dpe_class: prop.dpe_class,
            days_listed: daysListed,
            zone_avg_price_per_m2: zoneData?.price_avg_per_m2,
            zone_median_price_per_m2: zoneData?.price_median_per_m2,
            zone_price_trend_3y: zoneData?.price_trend,
            avg_rental_per_m2: zoneData?.avg_rental_per_m2,
            unemployment_rate: zoneData?.unemployment_rate,
            population_density: zoneData?.population_density,
          });

          // Store score
          const { error: insertError } = await supabaseAdmin
            .from('property_scores')
            .upsert({
              property_id: prop.id,
              scoring_weights_id: '00000000-0000-0000-0000-000000000000', // Default profile
              discount_score: score.discount_score,
              yield_score: score.yield_score,
              zone_score: score.zone_score,
              other_score: score.quality_score,
              total_score: score.total_score,
              computed_at: new Date().toISOString(),
            })
            .eq('property_id', prop.id);

          if (!insertError) scoredCount++;
        } catch (err) {
          console.warn(`Failed to score property ${prop.id}:`, err);
        }
      }

      console.log(`✅ Scored ${scoredCount} properties`);
      return scoredCount;
    } catch (err) {
      console.error('❌ Scoring failed:', err);
      throw err;
    }
  }
}

export default ScoringEngine;
