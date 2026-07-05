import { supabaseAdmin } from '../lib/supabase';

/**
 * Compare prices across all sources (DVF, Notaire, PAP scraper)
 * Validate data consistency and identify outliers
 */
async function comparePriceSources() {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  try {
    console.log('📊 Price Source Comparison Report');
    console.log('='.repeat(60));

    // Get top 10 cities with most data
    const { data: topCities, error: citiesError } = await supabaseAdmin
      .rpc('get_top_cities_by_transaction_count', { limit_count: 10 });

    if (citiesError) {
      console.log('Using fallback: manual city selection');
      const cities = ['Paris', 'Lyon', 'Marseille', 'Toulouse', 'Nice'];

      for (const city of cities) {
        await comparePricesForCity(city);
      }
    } else if (topCities) {
      for (const city of topCities) {
        await comparePricesForCity(city.city);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Price comparison completed');
    console.log('\nInterpretation:');
    console.log('  • DVF = Official government transaction data');
    console.log('  • Notaire = Official notaire chamber prices (PERVAL)');
    console.log('  • PAP = Scraped asking prices (may differ from sold prices)');
    console.log('  • Typical gap: PAP 10-20% higher than transaction prices');

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

async function comparePricesForCity(cityName: string) {
  if (!supabaseAdmin) return;

  try {
    console.log(`\n📍 ${cityName}`);
    console.log('-'.repeat(60));

    // Get DVF prices for city
    const { data: dvfData } = await supabaseAdmin
      .from('dvf_transactions')
      .select('price_per_m2')
      .ilike('postal_code', `%${cityName.substring(0, 2)}%`)
      .gte('transaction_date', '2023-01-01')
      .limit(1000);

    // Get properties (scraped) for city
    const { data: papData } = await supabaseAdmin
      .from('properties')
      .select('price_per_m2')
      .ilike('city', `%${cityName}%`)
      .eq('is_active', true)
      .limit(100);

    // Get zone stats
    const { data: zoneStats } = await supabaseAdmin
      .from('zone_stats')
      .select('*')
      .limit(10);

    const dvfPrices = (dvfData || []).map(d => d.price_per_m2).filter(p => p > 0);
    const papPrices = (papData || []).map(d => d.price_per_m2).filter(p => p > 0);

    // Calculate statistics
    const stats = {
      dvf: dvfPrices.length > 0 ? {
        count: dvfPrices.length,
        avg: Math.round(dvfPrices.reduce((a, b) => a + b, 0) / dvfPrices.length),
        median: Math.round(dvfPrices.sort((a, b) => a - b)[Math.floor(dvfPrices.length / 2)]),
        min: Math.round(Math.min(...dvfPrices)),
        max: Math.round(Math.max(...dvfPrices)),
      } : null,
      pap: papPrices.length > 0 ? {
        count: papPrices.length,
        avg: Math.round(papPrices.reduce((a, b) => a + b, 0) / papPrices.length),
        median: Math.round(papPrices.sort((a, b) => a - b)[Math.floor(papPrices.length / 2)]),
        min: Math.round(Math.min(...papPrices)),
        max: Math.round(Math.max(...papPrices)),
      } : null,
    };

    // Display results
    if (stats.dvf) {
      console.log(`DVF (Official Transactions):`);
      console.log(`  Count:  ${stats.dvf.count} transactions`);
      console.log(`  Avg:    €${stats.dvf.avg}/m²`);
      console.log(`  Median: €${stats.dvf.median}/m²`);
      console.log(`  Range:  €${stats.dvf.min} - €${stats.dvf.max}/m²`);
    }

    if (stats.pap) {
      console.log(`\nPAP (Scraped Asking Prices):`);
      console.log(`  Count:  ${stats.pap.count} listings`);
      console.log(`  Avg:    €${stats.pap.avg}/m²`);
      console.log(`  Median: €${stats.pap.median}/m²`);
      console.log(`  Range:  €${stats.pap.min} - €${stats.pap.max}/m²`);
    }

    // Calculate gap
    if (stats.dvf && stats.pap) {
      const gapPct = ((stats.pap.avg - stats.dvf.avg) / stats.dvf.avg) * 100;
      console.log(`\nPrice Gap (PAP vs DVF):`);
      console.log(`  ${gapPct > 0 ? '↑' : '↓'} ${Math.abs(gapPct).toFixed(1)}% ${gapPct > 0 ? 'higher' : 'lower'}`);
      console.log(`  This is ${gapPct > 0 ? 'typical' : 'unusual'} (asking prices often 10-20% above sold prices)`);
    }

    if (!stats.dvf && !stats.pap) {
      console.log('  No price data available for this city');
    }
  } catch (err) {
    console.warn(`  Error comparing ${cityName}:`, (err as Error).message);
  }
}

comparePriceSources();
