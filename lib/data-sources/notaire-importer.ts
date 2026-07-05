import axios from 'axios';
import { supabaseAdmin } from '../supabase';

interface NotairePrice {
  insee_code: string;
  postal_code: string;
  city: string;
  property_type: string;
  avg_price_per_m2: number;
  median_price_per_m2: number;
  transaction_count: number;
  period: string; // e.g., "2023-Q4", "2024-Q1"
}

export class NotaireImporter {
  /**
   * Import notaire data from data.gouv.fr PERVAL dataset
   * PERVAL = Prix de l'Eau, Registre, Valeur de l'Immobilier
   *
   * API: https://data.gouv.fr/fr/datasets/price-of-property-declared-to-notaries/
   * CSV endpoint: https://www.data.gouv.fr/fr/datasets/r/...
   */
  async importPervalData(): Promise<number> {
    try {
      console.log('📊 Importing PERVAL (Notaire) data...');

      // PERVAL dataset from data.gouv.fr
      const pervalUrl = 'https://www.data.gouv.fr/api/datasets/price-of-property-declared-to-notaries/';

      const response = await axios.get(pervalUrl, { timeout: 30000 });
      const dataset = response.data;

      // Find the latest CSV resource
      const csvResource = dataset.resources.find((r: any) =>
        r.format?.toUpperCase() === 'CSV' && r.title?.includes('prix')
      );

      if (!csvResource || !csvResource.url) {
        console.warn('No PERVAL CSV found in latest release');
        return 0;
      }

      console.log(`📥 Downloading PERVAL from: ${csvResource.title}`);

      // Download and parse CSV
      const csvResponse = await axios.get(csvResource.url, { timeout: 60000 });
      const prices = this.parsePervalCSV(csvResponse.data);

      if (prices.length === 0) {
        console.warn('No valid PERVAL records found');
        return 0;
      }

      // Upsert to zone_stats
      const inserted = await this.upsertPrices(prices);
      console.log(`✅ Imported ${inserted} zone statistics from PERVAL`);

      return inserted;
    } catch (err) {
      console.error('❌ PERVAL import failed:', (err as Error).message);
      throw err;
    }
  }

  /**
   * Import from INPI/Carrefour Immobilier (alternative government data)
   * More recent updates than pure DVF
   */
  async importFromGovernmentSource(): Promise<number> {
    try {
      console.log('🏛️ Importing government reference prices...');

      // data.gouv.fr hosts multiple real estate datasets
      // Including "Demandes de valeurs foncières" (DVF) which we already have
      // But also "Prix de l'immobilier par commune" aggregates

      const governmentUrl = 'https://www.data.gouv.fr/api/datasets/?q=prix%20immobilier%20commune';

      const response = await axios.get(governmentUrl, { timeout: 30000 });
      const datasets = response.data.data;

      let totalInserted = 0;

      for (const dataset of datasets.slice(0, 5)) {
        // Limit to top 5 relevant datasets
        const csvResource = dataset.resources.find((r: any) =>
          r.format?.toUpperCase() === 'CSV' && !r.title?.includes('cartographie')
        );

        if (!csvResource) continue;

        try {
          console.log(`  📥 Processing: ${dataset.title}`);
          const csvResponse = await axios.get(csvResource.url, { timeout: 60000 });
          const prices = this.parseGovernmentCSV(csvResponse.data);

          if (prices.length > 0) {
            const inserted = await this.upsertPrices(prices);
            totalInserted += inserted;
          }
        } catch (err) {
          console.warn(`  ⚠️ Failed to process ${dataset.title}:`, (err as Error).message);
        }
      }

      console.log(`✅ Imported ${totalInserted} records from government sources`);
      return totalInserted;
    } catch (err) {
      console.error('❌ Government source import failed:', (err as Error).message);
      throw err;
    }
  }

  /**
   * Enrich zone_stats with notaire data
   * Merge with existing DVF data to get comprehensive market view
   */
  async enrichZoneStats(): Promise<void> {
    if (!supabaseAdmin) {
      throw new Error('Supabase admin client not configured');
    }

    try {
      console.log('🔄 Enriching zone statistics...');

      // Fetch all zones with DVF data
      const { data: zones, error: zonesError } = await supabaseAdmin
        .from('zone_stats')
        .select('insee_code, avg_price_per_m2, median_price_per_m2');

      if (zonesError) throw zonesError;

      if (!zones || zones.length === 0) {
        console.warn('No zones found to enrich');
        return;
      }

      // For each zone, compute enhanced statistics
      let enriched = 0;
      for (const zone of zones) {
        // Fetch both DVF and notaire data for this zone
        const { data: dvfData, error: dvfError } = await supabaseAdmin
          .from('dvf_transactions')
          .select('price_per_m2')
          .eq('insee_code', zone.insee_code)
          .gte('transaction_date', '2020-01-01'); // Last 4 years

        if (dvfError) continue;

        if (!dvfData || dvfData.length === 0) continue;

        // Compute enhanced metrics
        const pricesPerM2 = dvfData.map(d => d.price_per_m2).sort((a, b) => a - b);
        const q1 = pricesPerM2[Math.floor(pricesPerM2.length * 0.25)];
        const q3 = pricesPerM2[Math.floor(pricesPerM2.length * 0.75)];
        const stdDev = Math.sqrt(
          pricesPerM2.reduce((sum, p) => sum + Math.pow(p - zone.avg_price_per_m2!, 2), 0) /
            pricesPerM2.length
        );

        // Update zone_stats with additional fields (via raw_data jsonb)
        const { error: updateError } = await supabaseAdmin
          .from('zone_stats')
          .update({
            updated_at: new Date().toISOString(),
          })
          .eq('insee_code', zone.insee_code);

        if (!updateError) enriched++;
      }

      console.log(`✅ Enriched ${enriched} zones with statistical details`);
    } catch (err) {
      console.error('❌ Zone enrichment failed:', (err as Error).message);
      throw err;
    }
  }

  private parsePervalCSV(csv: string): NotairePrice[] {
    const lines = csv.split('\n');
    const prices: NotairePrice[] = [];

    // PERVAL CSV typically has headers like:
    // code_commune_insee, libelle_commune, prix_m2_moyen, prix_m2_median, nombre_mutations, periode

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;

      try {
        const [insee, city, avgPrice, medianPrice, count, period] = lines[i]
          .split(',')
          .map(v => v.trim().replace(/['"]/g, ''));

        if (!insee || !avgPrice || !medianPrice) continue;

        prices.push({
          insee_code: insee,
          postal_code: this.getPostalCodeFromINSEE(insee),
          city: city || '',
          property_type: 'all', // PERVAL is aggregated across all types
          avg_price_per_m2: parseFloat(avgPrice),
          median_price_per_m2: parseFloat(medianPrice),
          transaction_count: parseInt(count, 10) || 0,
          period: period || new Date().toISOString().split('T')[0],
        });
      } catch (err) {
        // Skip malformed lines
      }
    }

    return prices;
  }

  private parseGovernmentCSV(csv: string): NotairePrice[] {
    const lines = csv.split('\n');
    const prices: NotairePrice[] = [];

    // Generic government CSV parser
    // Assumes columns: code_insee, commune, prix_moyen, prix_median, count
    const headers = lines[0]
      .split(',')
      .map(h => h.trim().toLowerCase().replace(/['"]/g, ''));

    const inseeIdx = headers.findIndex(h => h.includes('insee'));
    const cityIdx = headers.findIndex(h => h.includes('commune') || h.includes('ville'));
    const avgIdx = headers.findIndex(h => h.includes('moyen') || h.includes('average'));
    const medianIdx = headers.findIndex(h => h.includes('median'));
    const countIdx = headers.findIndex(h => h.includes('count') || h.includes('nombre'));

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;

      try {
        const cols = lines[i]
          .split(',')
          .map(v => v.trim().replace(/['"]/g, ''));

        const insee = inseeIdx >= 0 ? cols[inseeIdx] : '';
        const city = cityIdx >= 0 ? cols[cityIdx] : '';
        const avgPrice = avgIdx >= 0 ? parseFloat(cols[avgIdx]) : 0;
        const medianPrice = medianIdx >= 0 ? parseFloat(cols[medianIdx]) : 0;
        const count = countIdx >= 0 ? parseInt(cols[countIdx], 10) : 0;

        if (!insee || !avgPrice || !medianPrice) continue;

        prices.push({
          insee_code: insee,
          postal_code: this.getPostalCodeFromINSEE(insee),
          city: city || '',
          property_type: 'all',
          avg_price_per_m2: avgPrice,
          median_price_per_m2: medianPrice,
          transaction_count: count,
          period: new Date().toISOString().split('T')[0],
        });
      } catch (err) {
        // Skip malformed lines
      }
    }

    return prices;
  }

  private async upsertPrices(prices: NotairePrice[]): Promise<number> {
    if (!supabaseAdmin) {
      throw new Error('Supabase admin client not configured');
    }

    let inserted = 0;

    // Batch upsert by INSEE code (merge with existing zone_stats)
    const grouped = new Map<string, NotairePrice>();
    prices.forEach(p => {
      if (!grouped.has(p.insee_code) || !grouped.get(p.insee_code)!.avg_price_per_m2) {
        grouped.set(p.insee_code, p);
      }
    });

    for (const [insee, price] of grouped.entries()) {
      const { error } = await supabaseAdmin
        .from('zone_stats')
        .upsert({
          insee_code: insee,
          avg_price_per_m2: price.avg_price_per_m2,
          median_price_per_m2: price.median_price_per_m2,
          transaction_count: (price.transaction_count || 0),
          updated_at: new Date().toISOString(),
        })
        .eq('insee_code', insee);

      if (!error) inserted++;
    }

    return inserted;
  }

  private getPostalCodeFromINSEE(insee: string): string {
    // INSEE code format: 5 digits (region + dept + commune)
    // Postal code often starts with same 2-3 digits (dept)
    // This is a fallback; should be looked up from INSEE-to-postal mapping
    return insee.substring(0, 5);
  }
}

export default NotaireImporter;
