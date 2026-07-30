import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

import { normalizeSupabaseUrl } from './supabaseUrl';

const supabaseUrl = normalizeSupabaseUrl(process.env.EXPO_PUBLIC_SUPABASE_URL ?? '');
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
});

// ─── Types ────────────────────────────────────────────────────────────────────

/** `pending` is the default for anyone not on the allowlist — they see nothing. */
export type UserRole = 'pending' | 'member' | 'admin';

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  created_at: string;
};

export type AdapterKind = 'api' | 'jsonld' | 'apify';

export type Company = {
  id: string;
  slug: string;
  name: string;
  base_url: string;
  adapter: string;
  adapter_kind: AdapterKind;
  config: Record<string, unknown>;
  enabled: boolean;
  supports_availability: boolean;
  crawl_delay_ms: number;
  last_warmed_at: string | null;
};

export type Listing = {
  id: string;
  company_id: string;
  property_id: string | null;
  source_listing_id: string;
  name: string;
  url: string;
  hero_image_url: string | null;
  image_urls: string[];
  description: string | null;
  town: string | null;
  lat: number | null;
  lng: number | null;
  drive_minutes: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  sleeps: number | null;
  amenities: string[];
  nightly_rate_from: number | null;
  rating: number | null;
  review_count: number | null;
  last_seen_at: string;
  verified_at: string | null;
  created_at: string;
};

/**
 * A listing joined with its company + ban/keep state, straight from
 * `visible_listings`. Bans are already applied by the view, so nothing that
 * reads this type has to reason about ban scopes or durations.
 */
export type ListingWithMeta = Listing & {
  company_slug: string;
  company_name: string;
  /** Whether this source can answer date questions at all — see the view. */
  supports_availability: boolean;
  is_kept: boolean;
  keep_note: string | null;
  /**
   * true = free for the stay, false = booked, null = we don't know.
   * null is a real, distinct state: most company sites publish no calendar we
   * can query, and hiding those cabins would throw away most of the inventory.
   */
  available_for_trip: boolean | null;
  trip_total: number | null;
};

/** Per-day availability, decoded from whatever calendar format the source uses. */
export type DayState = 'A' | 'U' | 'I' | 'O';

export type Availability = {
  listing_id: string;
  day: string; // YYYY-MM-DD
  state: DayState;
  nightly_rate: number | null;
};

export type TripConfig = {
  id: string;
  season_year: number;
  check_in: string;
  check_out: string;
  guests: number;
  min_bedrooms: number | null;
  max_nightly_rate: number | null;
  max_total: number | null;
  required_amenities: string[];
  towns: string[];
  max_drive_minutes: number | null;
  min_rating: number | null;
  updated_by: string | null;
  updated_at: string;
};

export type BanScope = 'listing' | 'property' | 'company';
export type BanDuration = 'forever' | 'season';

export type Ban = {
  id: string;
  scope: BanScope;
  target_id: string;
  duration: BanDuration;
  season_year: number | null;
  reason: string | null;
  note: string | null;
  created_by: string;
  created_at: string;
  /** Denormalized for the ban-list UI so it doesn't need three joins. */
  target_label?: string | null;
};

export type Keep = {
  id: string;
  listing_id: string;
  note: string | null;
  created_by: string;
  created_at: string;
};

export type SearchRunStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped';

export type SearchRun = {
  id: string;
  started_by: string;
  season_year: number;
  status: SearchRunStatus;
  created_at: string;
  finished_at: string | null;
};

export type SearchRunSource = {
  id: string;
  run_id: string;
  company_id: string;
  company_slug: string;
  status: SearchRunStatus;
  found_count: number;
  available_count: number;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
};
