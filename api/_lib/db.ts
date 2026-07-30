// Server-side Supabase access for the scraper endpoints. Uses the service-role
// key, which bypasses RLS — it must never be exposed to the client, so this
// module is only ever imported from api/.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CompanyRow, DayAvailability, RawListing, TripWindow } from '../../scrapers/types';
import { addDays, nightsOf } from '../../scrapers/calendar';
import { resolveDriveMinutes } from '../../lib/geo';

/**
 * How much calendar to keep around the trip. Sources hand us up to two years of
 * days; storing all of it for every cabin would be ~130k rows for one company
 * and buys nothing. A week of padding either side covers "what if we shifted it
 * a day" without the bloat.
 */
const CALENDAR_PADDING_DAYS = 7;

let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('SUPABASE_URL is not set');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');

  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

export async function getTripConfig(): Promise<TripWindow & { seasonYear: number }> {
  const { data, error } = await db().from('trip_config').select('*').eq('id', 1).single();
  if (error) throw new Error(`Could not load trip_config: ${error.message}`);
  return {
    checkIn: data.check_in,
    checkOut: data.check_out,
    guests: data.guests,
    minBedrooms: data.min_bedrooms,
    maxNightlyRate: data.max_nightly_rate,
    seasonYear: data.season_year,
  };
}

export async function getCompanies(opts: { onlyEnabled?: boolean; slugs?: string[] } = {}) {
  let query = db().from('companies').select('*');
  if (opts.onlyEnabled !== false) query = query.eq('enabled', true);
  if (opts.slugs?.length) query = query.in('slug', opts.slugs);

  const { data, error } = await query;
  if (error) throw new Error(`Could not load companies: ${error.message}`);
  return (data ?? []) as CompanyRow[];
}

function toRow(companyId: string, listing: RawListing) {
  const lat = listing.lat ?? null;
  const lng = listing.lng ?? null;
  const town = listing.town ?? null;

  return {
    company_id: companyId,
    source_listing_id: listing.sourceListingId,
    name: listing.name,
    url: listing.url,
    hero_image_url: listing.heroImageUrl ?? null,
    image_urls: listing.imageUrls ?? [],
    description: listing.description ?? null,
    town,
    lat,
    lng,
    // Prefer what the adapter derived; otherwise fall back to the town table.
    drive_minutes: listing.driveMinutes ?? resolveDriveMinutes({ lat, lng }, town),
    bedrooms: listing.bedrooms ?? null,
    bathrooms: listing.bathrooms ?? null,
    sleeps: listing.sleeps ?? null,
    amenities: listing.amenities ?? [],
    nightly_rate_from: listing.nightlyRateFrom ?? null,
    rating: listing.rating ?? null,
    review_count: listing.reviewCount ?? null,
    last_seen_at: new Date().toISOString(),
  };
}

/**
 * Upsert a batch of listings, returning source id → listing id so availability
 * rows can be attached. Chunked because Supabase rejects very large payloads.
 */
export async function upsertListings(
  companyId: string,
  listings: RawListing[],
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  if (listings.length === 0) return ids;

  const CHUNK = 100;
  for (let i = 0; i < listings.length; i += CHUNK) {
    const rows = listings.slice(i, i + CHUNK).map((l) => toRow(companyId, l));
    const { data, error } = await db()
      .from('listings')
      .upsert(rows, { onConflict: 'company_id,source_listing_id' })
      .select('id, source_listing_id');

    if (error) throw new Error(`Upserting listings failed: ${error.message}`);
    for (const row of data ?? []) ids.set(row.source_listing_id, row.id);
  }
  return ids;
}

/** Trim a calendar to the window we actually keep. */
export function windowFor(trip: TripWindow): { from: string; to: string } {
  return {
    from: addDays(trip.checkIn, -CALENDAR_PADDING_DAYS),
    to: addDays(trip.checkOut, CALENDAR_PADDING_DAYS),
  };
}

export async function upsertAvailability(
  listingId: string,
  days: DayAvailability[],
  trip: TripWindow,
): Promise<void> {
  const { from, to } = windowFor(trip);
  const rows = days
    .filter((d) => d.day >= from && d.day <= to)
    .map((d) => ({
      listing_id: listingId,
      day: d.day,
      state: d.state,
      nightly_rate: d.nightlyRate ?? null,
      updated_at: new Date().toISOString(),
    }));

  if (rows.length === 0) return;

  const { error } = await db()
    .from('availability')
    .upsert(rows, { onConflict: 'listing_id,day' });
  if (error) throw new Error(`Upserting availability failed: ${error.message}`);
}

/** How many of these listings are bookable for the whole stay. */
export function countAvailable(
  perListing: { days: DayAvailability[] }[],
  trip: TripWindow,
): number {
  const nights = nightsOf(trip.checkIn, trip.checkOut);
  let n = 0;
  for (const { days } of perListing) {
    const byDay = new Map(days.map((d) => [d.day, d.state]));
    if (nights.every((night) => {
      const s = byDay.get(night);
      return s === 'A' || s === 'I';
    })) n++;
  }
  return n;
}

// ─── search_runs progress ────────────────────────────────────────────────────

export async function markSource(
  runId: string,
  companyId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await db()
    .from('search_run_sources')
    .update(patch)
    .eq('run_id', runId)
    .eq('company_id', companyId);
  if (error) console.error('Could not update search_run_sources:', error.message);
}

/** Close out a run once no source is still pending or running. */
export async function finishRunIfDone(runId: string): Promise<void> {
  const { data, error } = await db()
    .from('search_run_sources')
    .select('status')
    .eq('run_id', runId);
  if (error || !data) return;

  const stillGoing = data.some((s) => s.status === 'pending' || s.status === 'running');
  if (stillGoing) return;

  await db()
    .from('search_runs')
    .update({ status: 'done', finished_at: new Date().toISOString() })
    .eq('id', runId);
}
