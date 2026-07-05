import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Client-side browser client (anon key, limited RLS)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side admin client (service role key, full access)
export const supabaseAdmin = supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey)
  : null;

export type Database = {
  public: {
    Tables: {
      dvf_transactions: {
        Row: {
          id: string;
          insee_code: string;
          postal_code: string;
          transaction_date: string;
          price: number;
          surface_m2: number;
          price_per_m2: number;
          property_type: string;
          raw_data: Record<string, any> | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['dvf_transactions']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['dvf_transactions']['Insert']>;
      };
      zone_stats: {
        Row: {
          insee_code: string;
          avg_price_per_m2: number | null;
          median_price_per_m2: number | null;
          price_trend_3y_pct: number | null;
          transaction_count: number;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['zone_stats']['Row'], 'updated_at'>;
        Update: Partial<Database['public']['Tables']['zone_stats']['Insert']>;
      };
      properties: {
        Row: {
          id: string;
          source: string;
          source_url: string;
          title: string;
          price: number;
          surface_m2: number | null;
          price_per_m2: number | null;
          city: string | null;
          postal_code: string | null;
          insee_code: string | null;
          property_type: string | null;
          rooms: number | null;
          dpe_class: string | null;
          description: string | null;
          raw_data: Record<string, any> | null;
          first_seen_at: string;
          last_seen_at: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['properties']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['properties']['Insert']>;
      };
      scoring_weights: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          weight_discount_vs_market: number;
          weight_rental_yield: number;
          weight_zone_dynamics: number;
          weight_other_factors: number;
          is_active: boolean;
          alert_threshold: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['scoring_weights']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['scoring_weights']['Insert']>;
      };
      property_scores: {
        Row: {
          id: string;
          property_id: string;
          scoring_weights_id: string;
          discount_score: number | null;
          yield_score: number | null;
          zone_score: number | null;
          other_score: number | null;
          total_score: number | null;
          computed_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['property_scores']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['property_scores']['Insert']>;
      };
      alerts_sent: {
        Row: {
          id: string;
          property_id: string;
          user_id: string;
          sent_at: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['alerts_sent']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['alerts_sent']['Insert']>;
      };
    };
  };
};
