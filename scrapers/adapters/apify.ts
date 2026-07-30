// Airbnb and Vrbo, via Apify actors.
//
// These two actively block direct crawling, so they go through Apify's hosted
// actors instead. We use the run-sync-get-dataset-items endpoint, which runs the
// actor and returns its results in one request — a good fit for the on-demand
// search path, unlike the async run + poll flow.
//
// Both actors accept the trip dates, so unlike the catalog-only company sites
// these results are genuinely filtered to what's bookable for the weekend.
//
// Cost control: the free Apify tier is ~$5/month of compute. `maxItems` is
// capped and /api/search reuses cached OTA results rather than re-running the
// actor on every button press. If APIFY_TOKEN is unset the source reports
// `skipped` instead of failing the whole search.

import type { AdapterContext, RawListing, SourceAdapter } from '../types';
import { nightsOf } from '../calendar';
import { extractAmenities, normalizeTownName, parseDecimal, parseInteger, parseMoney, stripHtml } from '../normalize';
import { resolveDriveMinutes } from '../../lib/geo';

const APIFY_BASE = 'https://api.apify.com/v2';
const DEFAULT_MAX_ITEMS = 60;

export class MissingApifyTokenError extends Error {
  constructor() {
    super('APIFY_TOKEN is not set — skipping this source');
    this.name = 'MissingApifyTokenError';
  }
}

async function runActor(actor: string, input: unknown, ctx: AdapterContext): Promise<any[]> {
  const token = ctx.env.APIFY_TOKEN;
  if (!token) throw new MissingApifyTokenError();

  // Leave headroom so a slow actor doesn't blow the whole function's budget.
  const budgetMs = Math.max(10_000, ctx.deadline - Date.now() - 5_000);

  const res = await fetch(
    `${APIFY_BASE}/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(budgetMs),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Apify actor ${actor} failed: HTTP ${res.status} ${body.slice(0, 300)}`);
  }
  const items = await res.json();
  return Array.isArray(items) ? items : [];
}

/** Apify actors vary in field naming; probe several spellings for each value. */
function pick(item: any, ...keys: string[]): any {
  for (const key of keys) {
    const value = key.split('.').reduce<any>((acc, part) => acc?.[part], item);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function toRawListing(item: any, nights: number, fallbackUrl: string): RawListing | null {
  const id = pick(item, 'id', 'listingId', 'propertyId', 'roomId', 'url');
  const name = pick(item, 'name', 'title', 'listingTitle', 'propertyName');
  const url = pick(item, 'url', 'listingUrl', 'link') ?? fallbackUrl;
  if (!id || !name) return null;

  const lat = parseDecimal(pick(item, 'lat', 'latitude', 'coordinates.lat', 'location.lat'));
  const lng = parseDecimal(pick(item, 'lng', 'longitude', 'coordinates.lng', 'location.lng'));
  const town = normalizeTownName(
    pick(item, 'city', 'location.city', 'address.city', 'localizedCityName', 'neighborhood'),
  );

  // Some actors give a nightly rate, others only the trip total. Normalize to both.
  const nightly =
    parseMoney(pick(item, 'pricing.rate.amount', 'price.rate', 'nightlyPrice', 'pricePerNight')) ??
    null;
  const total = parseMoney(pick(item, 'pricing.total.amount', 'price.total', 'totalPrice'));

  const images = (pick(item, 'images', 'photos', 'imageUrls') ?? [])
    .map((img: any) => (typeof img === 'string' ? img : img?.url ?? img?.imageUrl))
    .filter((u: unknown): u is string => typeof u === 'string');

  const amenityList = (pick(item, 'amenities', 'amenityList') ?? [])
    .map((a: any) => (typeof a === 'string' ? a : a?.title ?? a?.name))
    .filter((a: unknown): a is string => typeof a === 'string');

  const description = stripHtml(pick(item, 'description', 'summary'));

  return {
    sourceListingId: String(id),
    name: String(name),
    url: String(url),
    heroImageUrl: images[0] ?? pick(item, 'thumbnail', 'primaryImage') ?? null,
    imageUrls: images.slice(0, 8),
    description,
    town,
    lat,
    lng,
    driveMinutes: resolveDriveMinutes({ lat, lng }, town),
    bedrooms: parseInteger(pick(item, 'bedrooms', 'numberOfBedrooms', 'beds')),
    bathrooms: parseDecimal(pick(item, 'bathrooms', 'numberOfBathrooms')),
    sleeps: parseInteger(pick(item, 'personCapacity', 'maxGuests', 'guests', 'sleeps')),
    amenities: extractAmenities(amenityList, description),
    nightlyRateFrom: nightly ?? (total != null && nights > 0 ? total / nights : null),
    rating: parseDecimal(pick(item, 'rating', 'stars', 'avgRating', 'rating.guestSatisfaction')),
    reviewCount: parseInteger(pick(item, 'reviewsCount', 'numberOfReviews', 'reviewCount')),
  };
}

/**
 * The actor already filtered to the trip dates, so everything it returns is
 * bookable. Marking every night 'A' lets these results flow through the exact
 * same availability logic as the calendar-based sources.
 */
function availabilityForTrip(ctx: AdapterContext, nightlyRate: number | null) {
  return nightsOf(ctx.trip.checkIn, ctx.trip.checkOut).map((day) => ({
    day,
    state: 'A' as const,
    nightlyRate,
  }));
}

function makeApifyAdapter(slug: string, defaultActor: string, buildInput: (ctx: AdapterContext, maxItems: number) => unknown): SourceAdapter {
  return {
    slug,

    // Nothing to warm: these are only ever queried for a specific trip window.
    async listCatalog() {
      return [];
    },

    async searchLive(ctx: AdapterContext): Promise<RawListing[]> {
      const actor = String(ctx.company.config.actor ?? defaultActor);
      const maxItems = Number(ctx.company.config.maxItems ?? DEFAULT_MAX_ITEMS);
      const nights = nightsOf(ctx.trip.checkIn, ctx.trip.checkOut).length;

      const items = await runActor(actor, buildInput(ctx, maxItems), ctx);
      ctx.log(`${slug}: ${items.length} items from actor ${actor}`);

      const out: RawListing[] = [];
      for (const item of items) {
        const listing = toRawListing(item, nights, ctx.company.base_url);
        if (!listing) continue;
        listing.availability = availabilityForTrip(ctx, listing.nightlyRateFrom ?? null);
        out.push(listing);
      }
      return out;
    },
  };
}

export const apifyAirbnb = makeApifyAdapter(
  'apify-airbnb',
  'tri_angle~airbnb-scraper',
  (ctx, maxItems) => ({
    locationQueries: ['Gatlinburg, TN', 'Pigeon Forge, TN', 'Sevierville, TN'],
    checkIn: ctx.trip.checkIn,
    checkOut: ctx.trip.checkOut,
    adults: ctx.trip.guests,
    minBedrooms: ctx.trip.minBedrooms ?? undefined,
    priceMax: ctx.trip.maxNightlyRate ?? undefined,
    currency: 'USD',
    maxItems,
  }),
);

export const apifyVrbo = makeApifyAdapter(
  'apify-vrbo',
  'parseforge~vrbo-scraper',
  (ctx, maxItems) => ({
    search: 'Gatlinburg, Tennessee, United States of America',
    checkIn: ctx.trip.checkIn,
    checkOut: ctx.trip.checkOut,
    adults: ctx.trip.guests,
    minBedrooms: ctx.trip.minBedrooms ?? undefined,
    currency: 'USD',
    maxItems,
  }),
);
