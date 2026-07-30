// Elk Springs Resort — the best-behaved source we have.
//
// Two endpoints, both first-party JSON, both verified against the live site:
//
//   GET /wp-json/elk/cabins
//     → raw.map_cabins is the ENTIRE catalog (178 cabins as of writing) with
//       full metadata in a single response. raw.cabins is only the paginated
//       24-per-page slice, so we deliberately read map_cabins instead.
//
//   GET /wp-json/elk/v1/cabins/<id>
//     → details.calendar_string + details.calendar_start_date, a ~150-day
//       availability bitmap. 150 days from today comfortably covers Labor Day,
//       so one call per cabin populates the whole season.
//
// There is no server-side date filter — their Svelte widget filters map_cabins
// client-side — which is why availability costs one request per cabin.

import type { AdapterContext, DayAvailability, RawListing, SourceAdapter } from '../types';
import { outOfTime } from '../types';
import { decodeCalendarString } from '../calendar';
import {
  absoluteUrl,
  extractAmenities,
  normalizeTownName,
  parseDecimal,
  parseInteger,
  parseMoney,
  stripHtml,
} from '../normalize';

type ElkCabin = {
  cabin_id: number;
  cabin_name: string;
  cabin_title?: string;
  cabin_url?: string;
  bedrooms?: number;
  bathrooms?: number;
  bathrooms_half?: number;
  sleeps?: number;
  amenities_description?: string;
  features_amenities?: string;
  intro_paragraph?: string;
  cabin_description?: string;
  photo_directory?: string;
  primary_photo?: string;
  website_photo_1?: string;
  website_photo_2?: string;
  website_photo_3?: string;
  nightly_rate?: string | number;
  price_range?: string;
  review_average?: string | number;
  review_count?: string | number;
  city?: string;
  website_location?: string;
  latitude?: string | number;
  longitude?: string | number;
  pet_friendly?: string | number;
  calendar_string?: string;
  calendar_start_date?: string;
};

const PHOTO_CDN = 'https://cdn.elkspringsresort.com/cabin-photos';

function photoUrl(cabin: ElkCabin, file?: string): string | null {
  if (!file || !cabin.photo_directory) return null;
  if (/^https?:\/\//i.test(file)) return file;
  return `${PHOTO_CDN}/${cabin.photo_directory}/${file}`;
}

function toRawListing(cabin: ElkCabin, baseUrl: string): RawListing {
  const amenityText = [cabin.amenities_description, cabin.features_amenities]
    .filter(Boolean)
    .join(', ');

  const amenities = extractAmenities(amenityText, cabin.intro_paragraph);
  // pet_friendly is a separate flag rather than part of the amenity blob.
  if (Number(cabin.pet_friendly) === 1 && !amenities.includes('pet_friendly')) {
    amenities.push('pet_friendly');
  }

  const images = [
    photoUrl(cabin, cabin.primary_photo),
    photoUrl(cabin, cabin.website_photo_1),
    photoUrl(cabin, cabin.website_photo_2),
    photoUrl(cabin, cabin.website_photo_3),
  ].filter((u): u is string => Boolean(u));

  const halfBaths = Number(cabin.bathrooms_half ?? 0);
  const baths = parseDecimal(cabin.bathrooms);

  return {
    sourceListingId: String(cabin.cabin_id),
    name: cabin.cabin_name || cabin.cabin_title || `Cabin ${cabin.cabin_id}`,
    url: absoluteUrl(baseUrl, `/cabins/${cabin.cabin_url ?? ''}`) ?? baseUrl,
    heroImageUrl: images[0] ?? null,
    imageUrls: images,
    description: stripHtml(cabin.intro_paragraph || cabin.cabin_description),
    town: normalizeTownName(cabin.city || cabin.website_location),
    lat: parseDecimal(cabin.latitude),
    lng: parseDecimal(cabin.longitude),
    bedrooms: parseInteger(cabin.bedrooms),
    bathrooms: baths != null ? baths + halfBaths * 0.5 : null,
    sleeps: parseInteger(cabin.sleeps),
    amenities,
    // nightly_rate comes back as ".0000" when no dates are in play; price_range
    // ("from $89") is the reliable floor.
    nightlyRateFrom: parseMoney(cabin.nightly_rate) ?? parseMoney(cabin.price_range),
    rating: parseDecimal(cabin.review_average),
    reviewCount: parseInteger(cabin.review_count),
    availability: cabin.calendar_string && cabin.calendar_start_date
      ? decodeCalendarString(cabin.calendar_start_date, cabin.calendar_string)
      : undefined,
  };
}

export const elkSprings: SourceAdapter = {
  slug: 'elk-springs',

  async listCatalog(ctx: AdapterContext): Promise<RawListing[]> {
    const base = ctx.company.base_url;
    const data = await ctx.fetchJson<{ raw?: { map_cabins?: ElkCabin[]; cabins?: ElkCabin[] } }>(
      `${base}/wp-json/elk/cabins`,
    );

    // map_cabins is the unpaginated set; cabins is page 1 only. Prefer the former.
    const cabins = data.raw?.map_cabins?.length ? data.raw.map_cabins : (data.raw?.cabins ?? []);
    ctx.log(`elk-springs catalog: ${cabins.length} cabins`);
    return cabins.map((c) => toRawListing(c, base));
  },

  async fetchAvailability(listing: RawListing, ctx: AdapterContext): Promise<DayAvailability[]> {
    if (outOfTime(ctx)) return [];
    const base = ctx.company.base_url;
    const data = await ctx.fetchJson<{ details?: ElkCabin }>(
      `${base}/wp-json/elk/v1/cabins/${listing.sourceListingId}`,
    );
    const d = data.details;
    if (!d?.calendar_string || !d.calendar_start_date) return [];
    return decodeCalendarString(d.calendar_start_date, d.calendar_string);
  },
};

export default elkSprings;
