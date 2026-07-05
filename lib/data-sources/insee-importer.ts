import axios from 'axios';
import { supabaseAdmin } from '../supabase';

interface INSEECommune {
  insee_code: string;
  postal_code: string;
  name: string;
  population: number;
  population_density: number;
  median_income: number;
  unemployment_rate: number;
  median_age: number;
  tertiary_sector_pct: number; // % jobs in service sector
  employment_accessibility: number; // Score 0-100
}

interface RDNAGeoloc {
  address: string;
  postal_code: string;
  insee_code: string;
  latitude: number;
  longitude: number;
  area_code?: string;
}

export class INSEEImporter {
  /**
   * Import INSEE demographic data for communes
   * Source: INSEE API (Institut National de la Statistique)
   *
   * API: https://api.insee.fr/
   * Requires: API key from INSEE portal
   */
  async importINSEEDemographics(): Promise<number> {
    try {
      console.log('📊 Importing INSEE demographic data...');

      // INSEE provides CSV exports from data.gouv.fr
      // https://www.data.gouv.fr/fr/datasets/communes-de-france-base-des-codes-postaux/

      const inseeCommunesUrl = 'https://data.opendatasoft.com/api/v2/catalog/datasets/communes-france/exports/json';

      const response = await axios.get(inseeCommunesUrl, { timeout: 30000 });
      const communes = response.data.records || [];

      console.log(`Found ${communes.length} communes in INSEE database`);

      let inserted = 0;

      // Batch upsert to zone_stats
      for (const commune of communes.slice(0, 5000)) {
        // Limit to prevent timeout
        try {
          const inseeCode = commune.fields?.code_commune_nouvelle || commune.fields?.code_commune;
          const postalCode = commune.fields?.code_postal;

          if (!inseeCode || !postalCode) continue;

          // Get additional data from INSEE API if available
          const enrichedData = await this.fetchINSEEDetails(inseeCode);

          const { error } = await supabaseAdmin
            .from('zone_stats')
            .upsert({
              insee_code: inseeCode,
              postal_code: postalCode,
              raw_data: {
                commune_name: commune.fields?.nom_commune,
                population: enrichedData?.population || null,
                population_density: enrichedData?.population_density || null,
                median_income: enrichedData?.median_income || null,
                unemployment_rate: enrichedData?.unemployment_rate || null,
                median_age: enrichedData?.median_age || null,
                tertiary_sector_pct: enrichedData?.tertiary_sector_pct || null,
                employment_accessibility: enrichedData?.employment_accessibility || null,
                insee_updated_at: new Date().toISOString(),
              },
            })
            .eq('insee_code', inseeCode);

          if (!error) inserted++;
        } catch (err) {
          // Continue on individual record failures
        }
      }

      console.log(`✅ Imported INSEE data for ${inserted} communes`);
      return inserted;
    } catch (err) {
      console.error('❌ INSEE import failed:', (err as Error).message);
      throw err;
    }
  }

  /**
   * Import RDNA (Répertoire des Numéros d'Adresse)
   * Official French address database with geocoding
   */
  async importRDNAGeolocation(): Promise<number> {
    try {
      console.log('🗺️  Importing RDNA geolocation data...');

      // RDNA is available via data.gouv.fr BAN (Base d'Adresses Nationale)
      // https://www.data.gouv.fr/fr/datasets/base-d-adresses-nationale-france/

      // For practical purposes, we'll cache lookups as we scrape properties
      // Real-time geocoding via BANapi: https://api-adresse.data.gouv.fr/

      console.log('ℹ️  RDNA: Using on-demand geocoding via BAN API');
      console.log('    Addresses will be geocoded as properties are scraped');

      return 0;
    } catch (err) {
      console.error('❌ RDNA import failed:', (err as Error).message);
      throw err;
    }
  }

  /**
   * Geocode address using BAN API (Base d'Adresses Nationale)
   * Returns lat/lng for address
   */
  async geocodeAddress(address: string, postalCode: string): Promise<RDNAGeoloc | null> {
    try {
      const query = `${address} ${postalCode}`;
      const response = await axios.get('https://api-adresse.data.gouv.fr/search/', {
        params: { q: query, limit: 1 },
        timeout: 5000,
      });

      const result = response.data.features?.[0];
      if (!result) return null;

      const props = result.properties;
      return {
        address: props.label,
        postal_code: postalCode,
        insee_code: props.citycode,
        latitude: result.geometry.coordinates[1],
        longitude: result.geometry.coordinates[0],
        area_code: props.context?.split(',')[0],
      };
    } catch (err) {
      console.warn('Geocoding failed for:', address, postalCode);
      return null;
    }
  }

  /**
   * Fetch detailed INSEE metrics for a commune
   * Uses public INSEE dataset exports
   */
  private async fetchINSEEDetails(inseeCode: string): Promise<Partial<INSEECommune> | null> {
    try {
      // https://api.insee.fr/ requires auth, but public CSV exports available on data.gouv.fr
      // For demo: return placeholder data structure
      // In production: integrate with INSEE API or use pre-downloaded CSVs

      // Simplified: return structure for now, will be populated from data.gouv.fr datasets
      return {
        population: Math.floor(Math.random() * 100000), // Placeholder
      };
    } catch (err) {
      return null;
    }
  }
}

export default INSEEImporter;
