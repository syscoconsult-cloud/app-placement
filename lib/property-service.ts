import { supabaseAdmin } from './supabase';
import type { ScrapedProperty } from './scrapers/base-scraper';

export interface PropertyUpsertResult {
  inserted: number;
  updated: number;
  failed: number;
  errors: string[];
}

export async function upsertProperties(
  properties: ScrapedProperty[],
  source: string
): Promise<PropertyUpsertResult> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  const result: PropertyUpsertResult = {
    inserted: 0,
    updated: 0,
    failed: 0,
    errors: [],
  };

  for (const prop of properties) {
    try {
      const { data, error } = await supabaseAdmin
        .from('properties')
        .upsert(
          {
            source: prop.source,
            source_url: prop.source_url,
            title: prop.title,
            price: prop.price,
            surface_m2: prop.surface_m2,
            price_per_m2: prop.surface_m2 ? Math.round((prop.price / prop.surface_m2) * 100) / 100 : null,
            city: prop.city,
            postal_code: prop.postal_code,
            insee_code: null, // Will be populated later via geocoding
            property_type: prop.property_type,
            rooms: prop.rooms,
            dpe_class: prop.dpe_class,
            description: prop.description,
            raw_data: prop.raw_data,
            first_seen_at: new Date().toISOString(),
            last_seen_at: new Date().toISOString(),
            is_active: true,
          },
          { onConflict: 'source,source_url' }
        )
        .select();

      if (error) {
        result.failed++;
        result.errors.push(`${prop.source_url}: ${error.message}`);
      } else {
        result.inserted++;
      }
    } catch (err) {
      result.failed++;
      result.errors.push(`${prop.source_url}: ${(err as Error).message}`);
    }
  }

  return result;
}

export async function markStaleListingsAsInactive(source: string, maxAgeDays: number = 7): Promise<number> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

  const { data, error } = await supabaseAdmin
    .from('properties')
    .update({ is_active: false })
    .eq('source', source)
    .lt('last_seen_at', cutoffDate.toISOString())
    .select('id');

  if (error) {
    throw new Error(`Failed to mark stale listings: ${error.message}`);
  }

  return (data || []).length;
}

export async function getActiveProperties(source: string, limit: number = 100): Promise<any[]> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  const { data, error } = await supabaseAdmin
    .from('properties')
    .select()
    .eq('source', source)
    .eq('is_active', true)
    .order('last_seen_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch properties: ${error.message}`);
  }

  return data || [];
}
