// The contract every source implements. Keeping it this small is what makes
// adding a new rental company cheap — most of them only need `listCatalog`.

export type DayState = 'A' | 'U' | 'I' | 'O';

export type DayAvailability = {
  /** YYYY-MM-DD */
  day: string;
  state: DayState;
  nightlyRate?: number | null;
};

export type RawListing = {
  /** Stable id within this source. Combined with company_id it's the upsert key. */
  sourceListingId: string;
  name: string;
  url: string;
  heroImageUrl?: string | null;
  imageUrls?: string[];
  description?: string | null;
  town?: string | null;
  lat?: number | null;
  lng?: number | null;
  /** Estimated minutes from Knoxville; derived, not scraped. See lib/geo.ts. */
  driveMinutes?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  sleeps?: number | null;
  /** Canonical amenity keys from constants/cabins.ts. */
  amenities?: string[];
  nightlyRateFrom?: number | null;
  rating?: number | null;
  reviewCount?: number | null;
  /** Populated when the source hands us a calendar without an extra request. */
  availability?: DayAvailability[];
};

export type CompanyRow = {
  id: string;
  slug: string;
  name: string;
  base_url: string;
  adapter: string;
  adapter_kind: 'api' | 'jsonld' | 'apify';
  config: Record<string, any>;
  crawl_delay_ms: number;
  supports_availability: boolean;
};

export type TripWindow = {
  checkIn: string;   // YYYY-MM-DD
  checkOut: string;  // YYYY-MM-DD
  guests: number;
  minBedrooms?: number | null;
  maxNightlyRate?: number | null;
};

export type AdapterContext = {
  company: CompanyRow;
  trip: TripWindow;
  fetchText: (url: string, init?: RequestInit) => Promise<string>;
  fetchJson: <T = any>(url: string, init?: RequestInit) => Promise<T>;
  log: (msg: string, extra?: Record<string, unknown>) => void;
  /** Wall-clock budget. Adapters should check this and return partial results. */
  deadline: number;
  env: Record<string, string | undefined>;
};

export type SourceAdapter = {
  slug: string;
  /** Full catalog for the warm tier. */
  listCatalog(ctx: AdapterContext): Promise<RawListing[]>;
  /** Per-listing calendar for the warm tier, when not already inlined. */
  fetchAvailability?(listing: RawListing, ctx: AdapterContext): Promise<DayAvailability[]>;
  /**
   * Hot tier: a dated search that returns only what's actually bookable.
   * Sources that can do this get real availability without a warm pass.
   */
  searchLive?(ctx: AdapterContext): Promise<RawListing[]>;
};

export function outOfTime(ctx: AdapterContext): boolean {
  return Date.now() > ctx.deadline;
}
