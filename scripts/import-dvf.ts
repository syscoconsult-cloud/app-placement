import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { fetch } from 'undici';

interface DVFRecord {
  insee_code: string;
  postal_code: string;
  transaction_date: string;
  price: number;
  surface_m2: number;
  property_type: string;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const departments = (process.env.DVF_DEPARTMENTS || '75,51').split(',');

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function downloadDVFFile(dept: string, year: number): Promise<string> {
  console.log(`Downloading DVF for department ${dept}, year ${year}...`);

  const url = `https://files.data.gouv.fr/geo-dvf/latest/dvf_${dept}_${year}.csv`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download DVF file: ${response.statusText}`);
  }

  const text = await response.text();
  return text;
}

function parseCSVLine(line: string): Record<string, string> {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);

  return values.reduce((acc, val, idx) => {
    const headerName = ['code_commune_insee', 'code_postal', 'date_mutation', 'prix_total', 'nombre_dispositions', 'type_local', 'surface_reelle_batie'][idx];
    if (headerName) acc[headerName] = val;
    return acc;
  }, {} as Record<string, string>);
}

function parseDVFData(csvContent: string): DVFRecord[] {
  const lines = csvContent.split('\n');
  const records: DVFRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;

    try {
      const parsed = parseCSVLine(lines[i]);
      const price = parseInt(parsed.prix_total, 10);
      const surface = parseFloat(parsed.surface_reelle_batie);

      if (!price || !surface || price <= 0 || surface <= 0) continue;

      records.push({
        insee_code: parsed.code_commune_insee,
        postal_code: parsed.code_postal,
        transaction_date: parsed.date_mutation,
        price,
        surface_m2: surface,
        property_type: normalizePropertyType(parsed.type_local),
      });
    } catch (err) {
      console.error(`Error parsing line ${i}:`, err);
    }
  }

  return records;
}

function normalizePropertyType(type: string): string {
  const typeMap: Record<string, string> = {
    'Maison': 'house',
    'Appartement': 'apartment',
    'Terrain': 'land',
    'Dépendance': 'dependency',
  };
  return typeMap[type] || type;
}

async function importDVF() {
  try {
    console.log('Starting DVF import for departments:', departments);

    const currentYear = new Date().getFullYear();
    const years = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3];

    for (const dept of departments) {
      for (const year of years) {
        try {
          const csvContent = await downloadDVFFile(dept, year);
          const records = parseDVFData(csvContent);

          if (records.length === 0) {
            console.log(`No valid records for department ${dept}, year ${year}`);
            continue;
          }

          console.log(`Inserting ${records.length} records for department ${dept}, year ${year}...`);

          const { error } = await supabase
            .from('dvf_transactions')
            .upsert(
              records.map(r => ({
                insee_code: r.insee_code,
                postal_code: r.postal_code,
                transaction_date: r.transaction_date,
                price: r.price,
                surface_m2: r.surface_m2,
                price_per_m2: Math.round((r.price / r.surface_m2) * 100) / 100,
                property_type: r.property_type,
              })),
              { onConflict: 'id' }
            );

          if (error) throw error;
          console.log(`✓ Imported ${records.length} records for department ${dept}, year ${year}`);
        } catch (err) {
          console.warn(`Skipping department ${dept}, year ${year}:`, (err as Error).message);
        }
      }
    }

    console.log('Computing zone statistics...');
    await computeZoneStats();

    console.log('✓ DVF import completed successfully');
  } catch (err) {
    console.error('DVF import failed:', err);
    process.exit(1);
  }
}

async function computeZoneStats() {
  const { data: inseeCodesResult, error: codesError } = await supabase
    .from('dvf_transactions')
    .select('insee_code')
    .order('insee_code');

  if (codesError) throw codesError;

  const inseeCodes = [...new Set((inseeCodesResult || []).map(r => r.insee_code))];

  for (const inseeCode of inseeCodes) {
    const { data: transactions, error: txError } = await supabase
      .from('dvf_transactions')
      .select('price_per_m2, transaction_date')
      .eq('insee_code', inseeCode);

    if (txError) throw txError;
    if (!transactions || transactions.length === 0) continue;

    const pricesPerM2 = transactions.map(t => t.price_per_m2).sort((a, b) => a - b);
    const avgPrice = pricesPerM2.reduce((a, b) => a + b, 0) / pricesPerM2.length;
    const medianPrice = pricesPerM2[Math.floor(pricesPerM2.length / 2)];

    // Calculate 3-year trend (placeholder)
    const threeYearAgo = new Date();
    threeYearAgo.setFullYear(threeYearAgo.getFullYear() - 3);

    const recentTx = transactions.filter(t => new Date(t.transaction_date) >= threeYearAgo);
    const olderTx = transactions.filter(t => new Date(t.transaction_date) < threeYearAgo);

    const recentAvg = recentTx.length > 0 ? recentTx.reduce((a, t) => a + t.price_per_m2, 0) / recentTx.length : avgPrice;
    const olderAvg = olderTx.length > 0 ? olderTx.reduce((a, t) => a + t.price_per_m2, 0) / olderTx.length : avgPrice;

    const trend = olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0;

    const { error: upsertError } = await supabase
      .from('zone_stats')
      .upsert({
        insee_code: inseeCode,
        avg_price_per_m2: Math.round(avgPrice * 100) / 100,
        median_price_per_m2: Math.round(medianPrice * 100) / 100,
        price_trend_3y_pct: Math.round(trend * 100) / 100,
        transaction_count: transactions.length,
        updated_at: new Date().toISOString(),
      });

    if (upsertError) throw upsertError;
  }

  console.log(`✓ Computed stats for ${inseeCodes.length} zones`);
}

importDVF().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
