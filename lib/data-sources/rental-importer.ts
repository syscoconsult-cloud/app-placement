import axios from 'axios';
import { supabaseAdmin } from '../supabase';

interface RentalData {
  insee_code: string;
  postal_code: string;
  city: string;
  property_type: string; // 'apartment', 'house'
  rental_price_per_m2: number; // €/m²/month
  rental_yield_annual_pct: number; // Expected yield
  evolution_1y_pct?: number;
  evolution_3y_pct?: number;
  last_updated: string;
}

export class RentalImporter {
  /**
   * Import rental data from ANIL (Association Nationale d'Information sur le Logement)
   * ANIL publishes "Loyers et Charges" (Rent & Charges) statistics
   *
   * Source: https://www.data.gouv.fr/fr/datasets/loyers-et-charges/
   */
  async importANILRentalData(): Promise<number> {
    try {
      console.log('🏠 Importing ANIL rental data (Loyers et Charges)...');

      // ANIL dataset on data.gouv.fr
      const anilDatasetUrl = 'https://www.data.gouv.fr/api/datasets/loyers-et-charges/';

      const response = await axios.get(anilDatasetUrl, { timeout: 30000 });
      const dataset = response.data;

      // Find latest CSV
      const csvResource = dataset.resources.find((r: any) =>
        r.format?.toUpperCase() === 'CSV'
      );

      if (!csvResource) {
        console.warn('⚠️  No ANIL CSV found');
        return 0;
      }

      console.log(`📥 Downloading ANIL data: ${csvResource.title}`);

      const csvResponse = await axios.get(csvResource.url, { timeout: 60000 });
      const rentalData = this.parseANILCSV(csvResponse.data);

      if (rentalData.length === 0) {
        console.warn('No valid rental records found');
        return 0;
      }

      const inserted = await this.upsertRentalData(rentalData);
      console.log(`✅ Imported ${inserted} rental statistics from ANIL`);

      return inserted;
    } catch (err) {
      console.error('❌ ANIL import failed:', (err as Error).message);
      throw err;
    }
  }

  /**
   * Import rental data from CLAMEUR (data.gouv.fr rental price dataset)
   * More recent updates than ANIL
   */
  async importCLAMEURData(): Promise<number> {
    try {
      console.log('📈 Importing CLAMEUR rental evolution data...');

      // CLAMEUR: rental price tracking
      const clamerDatasetUrl = 'https://www.data.gouv.fr/api/datasets/?q=clameur%20loyer';

      const response = await axios.get(clamerDatasetUrl, { timeout: 30000 });
      const datasets = response.data.data;

      if (!datasets || datasets.length === 0) {
        console.warn('⚠️  No CLAMEUR datasets found');
        return 0;
      }

      let totalInserted = 0;

      for (const dataset of datasets.slice(0, 3)) {
        const csvResource = dataset.resources.find((r: any) =>
          r.format?.toUpperCase() === 'CSV'
        );

        if (!csvResource) continue;

        try {
          console.log(`  Processing: ${dataset.title}`);

          const csvResponse = await axios.get(csvResource.url, { timeout: 60000 });
          const rentalData = this.parseCLAMEURCSV(csvResponse.data);

          if (rentalData.length > 0) {
            const inserted = await this.upsertRentalData(rentalData);
            totalInserted += inserted;
          }
        } catch (err) {
          console.warn(`  ⚠️  Failed to process dataset:`, (err as Error).message);
        }
      }

      console.log(`✅ Imported ${totalInserted} records from CLAMEUR`);
      return totalInserted;
    } catch (err) {
      console.error('❌ CLAMEUR import failed:', (err as Error).message);
      throw err;
    }
  }

  /**
   * Calculate estimated rental yield for a property
   * Based on zone average rental price
   */
  async estimateYield(postalCode: string, surface_m2: number): Promise<number | null> {
    if (!supabaseAdmin) return null;

    try {
      const { data: rentalStats } = await supabaseAdmin
        .from('zone_rental_stats')
        .select('rental_price_per_m2')
        .like('postal_code', `${postalCode.substring(0, 3)}%`)
        .limit(1)
        .single();

      if (!rentalStats || !rentalStats.rental_price_per_m2) return null;

      // Monthly rent estimate
      const monthlyRent = rentalStats.rental_price_per_m2 * surface_m2;
      const annualRent = monthlyRent * 12;

      return annualRent;
    } catch (err) {
      return null;
    }
  }

  /**
   * Create zone_rental_stats table (enrichment)
   */
  async createRentalStatsTable(): Promise<void> {
    if (!supabaseAdmin) return;

    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS zone_rental_stats (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        insee_code text NOT NULL UNIQUE,
        postal_code text NOT NULL,
        city text,

        -- Rental prices (€/m²/month)
        apartment_rental_per_m2 numeric,
        house_rental_per_m2 numeric,
        avg_rental_per_m2 numeric,

        -- Trends
        rental_evolution_1y_pct numeric,
        rental_evolution_3y_pct numeric,

        -- Summary metrics
        estimated_yield_apartment_pct numeric,
        estimated_yield_house_pct numeric,

        updated_at timestamptz DEFAULT now(),

        CONSTRAINT zone_rental_postal UNIQUE (postal_code)
      );

      CREATE INDEX IF NOT EXISTS zone_rental_insee ON zone_rental_stats(insee_code);
      CREATE INDEX IF NOT EXISTS zone_rental_postal ON zone_rental_stats(postal_code);
    `;

    try {
      await supabaseAdmin.rpc('execute_sql', { sql: createTableSQL });
      console.log('✅ zone_rental_stats table created');
    } catch (err) {
      console.warn('⚠️  zone_rental_stats table may already exist');
    }
  }

  private parseANILCSV(csv: string): RentalData[] {
    const lines = csv.split('\n');
    const rentalData: RentalData[] = [];

    // ANIL CSV: code_commune, libelle, loyer_moyen_m2, evolution_1an, evolution_3ans
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;

      try {
        const [insee, city, rentalPerM2, evo1y, evo3y] = lines[i]
          .split(',')
          .map(v => v.trim().replace(/['"]/g, ''));

        if (!insee || !rentalPerM2) continue;

        const rentalPrice = parseFloat(rentalPerM2);
        if (isNaN(rentalPrice) || rentalPrice <= 0) continue;

        // Estimate annual yield: (monthly_rent * 12) / property_price
        // For now, store monthly rental price, yield calculated on per-property basis
        const estimatedYield = (rentalPrice * 12) / 2000; // Assume €2000/m² property price

        rentalData.push({
          insee_code: insee,
          postal_code: insee.substring(0, 5),
          city: city || '',
          property_type: 'all',
          rental_price_per_m2: rentalPrice,
          rental_yield_annual_pct: Math.round(estimatedYield * 10) / 10,
          evolution_1y_pct: evo1y ? parseFloat(evo1y) : undefined,
          evolution_3y_pct: evo3y ? parseFloat(evo3y) : undefined,
          last_updated: new Date().toISOString(),
        });
      } catch (err) {
        // Skip malformed lines
      }
    }

    return rentalData;
  }

  private parseCLAMEURCSV(csv: string): RentalData[] {
    const lines = csv.split('\n');
    const rentalData: RentalData[] = [];

    // CLAMEUR CSV: commune, code_postal, type, prix_moyen_m2, evolution
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;

      try {
        const cols = lines[i]
          .split(',')
          .map(v => v.trim().replace(/['"]/g, ''));

        const city = cols[0];
        const postalCode = cols[1];
        const type = cols[2];
        const rentalPerM2 = parseFloat(cols[3]);
        const evolution = cols[4] ? parseFloat(cols[4]) : undefined;

        if (!city || !postalCode || !rentalPerM2 || isNaN(rentalPerM2)) continue;

        // Estimate INSEE from postal (not perfect but works for most cases)
        const insee = postalCode + city.substring(0, 2).toUpperCase();

        const estimatedYield = (rentalPerM2 * 12) / 2000;

        rentalData.push({
          insee_code: insee,
          postal_code: postalCode,
          city: city,
          property_type: type.toLowerCase() || 'all',
          rental_price_per_m2: rentalPerM2,
          rental_yield_annual_pct: Math.round(estimatedYield * 10) / 10,
          evolution_1y_pct: evolution,
          last_updated: new Date().toISOString(),
        });
      } catch (err) {
        // Skip malformed lines
      }
    }

    return rentalData;
  }

  private async upsertRentalData(rentalData: RentalData[]): Promise<number> {
    if (!supabaseAdmin) return 0;

    let inserted = 0;

    // Group by postal code to consolidate
    const grouped = new Map<string, RentalData>();
    rentalData.forEach(r => {
      if (!grouped.has(r.postal_code) || !grouped.get(r.postal_code)!.rental_price_per_m2) {
        grouped.set(r.postal_code, r);
      }
    });

    for (const [, data] of grouped.entries()) {
      try {
        const { error } = await supabaseAdmin
          .from('zone_rental_stats')
          .upsert({
            insee_code: data.insee_code,
            postal_code: data.postal_code,
            city: data.city,
            apartment_rental_per_m2: data.property_type === 'apartment' ? data.rental_price_per_m2 : null,
            house_rental_per_m2: data.property_type === 'house' ? data.rental_price_per_m2 : null,
            avg_rental_per_m2: data.rental_price_per_m2,
            rental_evolution_1y_pct: data.evolution_1y_pct,
            rental_evolution_3y_pct: data.evolution_3y_pct,
            estimated_yield_apartment_pct: data.property_type === 'apartment' ? data.rental_yield_annual_pct : null,
            estimated_yield_house_pct: data.property_type === 'house' ? data.rental_yield_annual_pct : null,
            updated_at: new Date().toISOString(),
          })
          .eq('postal_code', data.postal_code);

        if (!error) inserted++;
      } catch (err) {
        console.warn(`Failed to upsert rental data for ${data.postal_code}`);
      }
    }

    return inserted;
  }
}

export default RentalImporter;
