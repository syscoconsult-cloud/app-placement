import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const searchParams = request.nextUrl.searchParams;
    const city = searchParams.get('city');
    const minPrice = searchParams.get('minPrice');
    const maxPrice = searchParams.get('maxPrice');
    const minScore = searchParams.get('minScore');
    const propertyType = searchParams.get('propertyType');
    const minYield = searchParams.get('minYield');
    const limit = searchParams.get('limit') || '50';

    // Build query
    let query = supabaseAdmin
      .from('properties')
      .select(`
        *,
        property_scores (
          total_score,
          discount_score,
          yield_score,
          zone_score,
          other_score
        ),
        zone_complete_profile:postal_code (
          *
        )
      `)
      .eq('is_active', true)
      .order('last_seen_at', { ascending: false })
      .limit(parseInt(limit));

    // Apply filters
    if (city) {
      query = query.ilike('city', `%${city}%`);
    }

    if (minPrice) {
      query = query.gte('price', parseInt(minPrice));
    }

    if (maxPrice) {
      query = query.lte('price', parseInt(maxPrice));
    }

    if (propertyType) {
      query = query.eq('property_type', propertyType);
    }

    const { data: properties, error } = await query;

    if (error) {
      console.error('DB error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Filter by score and yield if provided
    let filtered = properties || [];

    if (minScore) {
      const scoreThreshold = parseFloat(minScore);
      filtered = filtered.filter((p: any) => {
        const score = p.property_scores?.[0]?.total_score || 0;
        return score >= scoreThreshold;
      });
    }

    if (minYield) {
      const yieldThreshold = parseFloat(minYield);
      filtered = filtered.filter((p: any) => {
        const zoneData = p.zone_complete_profile?.[0];
        return (zoneData?.estimated_yield_apartment_pct || 0) >= yieldThreshold;
      });
    }

    // Enrich with zone data
    const enriched = filtered.map((p: any) => {
      const zoneData = Array.isArray(p.zone_complete_profile)
        ? p.zone_complete_profile[0]
        : p.zone_complete_profile;
      const scores = p.property_scores?.[0] || {};

      const avgRental = zoneData?.avg_rental_per_m2;
      const surfaceM2 = p.surface_m2;
      const price = p.price;

      let estimatedYield = 0;
      if (avgRental && surfaceM2 && price) {
        const monthlyRent = avgRental * surfaceM2;
        const annualRent = monthlyRent * 12;
        estimatedYield = (annualRent / price) * 100;
      }

      return {
        id: p.id,
        title: p.title,
        price: p.price,
        surface_m2: p.surface_m2,
        price_per_m2: p.price_per_m2,
        city: p.city,
        postal_code: p.postal_code,
        property_type: p.property_type,
        dpe_class: p.dpe_class,
        source_url: p.source_url,
        // Scores
        total_score: scores.total_score || 0,
        discount_score: scores.discount_score || 0,
        yield_score: scores.yield_score || 0,
        zone_score: scores.zone_score || 0,
        other_score: scores.other_score || 0,
        // Zone enrichment
        zone_avg_price_per_m2: zoneData?.price_avg_per_m2,
        zone_median_price_per_m2: zoneData?.price_median_per_m2,
        price_trend: zoneData?.price_trend,
        avg_rental_per_m2: zoneData?.avg_rental_per_m2,
        estimated_yield: estimatedYield,
      };
    });

    return NextResponse.json({
      count: enriched.length,
      data: enriched,
    });
  } catch (err) {
    console.error('API error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
