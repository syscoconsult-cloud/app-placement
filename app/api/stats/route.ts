import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    // Fetch all active properties with scores and zone data
    const { data: properties, error } = await supabaseAdmin
      .from('properties')
      .select(`
        id,
        price,
        surface_m2,
        price_per_m2,
        property_scores (
          total_score
        ),
        zone_complete_profile:postal_code (
          avg_rental_per_m2,
          price_avg_per_m2
        )
      `)
      .eq('is_active', true)
      .limit(1000);

    if (error) {
      console.error('DB error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!properties || properties.length === 0) {
      return NextResponse.json({
        totalProperties: 0,
        averagePrice: 0,
        averageScore: 0,
        excellentDeals: 0,
        avgPricePerM2: 0,
        avgRentalYield: 0,
      });
    }

    // Calculate statistics
    let totalScore = 0;
    let totalPrice = 0;
    let totalPricePerM2 = 0;
    let excellentDeals = 0;
    let totalYield = 0;
    let yieldCount = 0;
    let pricePerM2Count = 0;

    for (const prop of properties) {
      // Price
      if (prop.price) {
        totalPrice += prop.price;
      }

      // Score
      const score = prop.property_scores?.[0]?.total_score || 0;
      totalScore += score;
      if (score >= 70) {
        excellentDeals++;
      }

      // Price per m²
      if (prop.price_per_m2) {
        totalPricePerM2 += prop.price_per_m2;
        pricePerM2Count++;
      }

      // Rental yield
      const zoneData = Array.isArray(prop.zone_complete_profile)
        ? prop.zone_complete_profile[0]
        : prop.zone_complete_profile;

      if (zoneData?.avg_rental_per_m2 && prop.surface_m2 && prop.price) {
        const monthlyRent = zoneData.avg_rental_per_m2 * prop.surface_m2;
        const annualRent = monthlyRent * 12;
        const yield_ = (annualRent / prop.price) * 100;
        totalYield += yield_;
        yieldCount++;
      }
    }

    const stats = {
      totalProperties: properties.length,
      averagePrice: properties.length > 0 ? totalPrice / properties.length : 0,
      averageScore: properties.length > 0 ? totalScore / properties.length : 0,
      excellentDeals: excellentDeals,
      avgPricePerM2: pricePerM2Count > 0 ? totalPricePerM2 / pricePerM2Count : 0,
      avgRentalYield: yieldCount > 0 ? totalYield / yieldCount : 0,
    };

    return NextResponse.json(stats);
  } catch (err) {
    console.error('API error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
