// Shared vocabulary for filters, chips, and scraper normalization.

/** Canonical amenity keys. Scrapers map free-text into these via AMENITY_PATTERNS. */
export const AMENITIES = [
  { value: 'hot_tub', label: 'Hot Tub' },
  { value: 'pool_private', label: 'Private Pool' },
  { value: 'pool_shared', label: 'Shared Pool' },
  { value: 'pool_table', label: 'Pool Table' },
  { value: 'arcade', label: 'Arcade / Game Room' },
  { value: 'theater', label: 'Home Theater' },
  { value: 'fireplace', label: 'Fireplace' },
  { value: 'mountain_view', label: 'Mountain View' },
  { value: 'pet_friendly', label: 'Pet Friendly' },
  { value: 'wifi', label: 'WiFi' },
  { value: 'firepit', label: 'Fire Pit' },
  { value: 'sauna', label: 'Sauna' },
  { value: 'grill', label: 'Grill' },
  { value: 'washer_dryer', label: 'Washer / Dryer' },
  { value: 'ev_charger', label: 'EV Charger' },
  { value: 'resort_pool', label: 'Resort Pool Access' },
] as const;

export type AmenityKey = (typeof AMENITIES)[number]['value'];

/**
 * Free-text → canonical amenity. Order matters: the first pattern that matches
 * a phrase wins, so put the more specific pattern first (private pool before pool).
 */
export const AMENITY_PATTERNS: [RegExp, AmenityKey][] = [
  [/\b(private|indoor heated|indoor)\s+pool\b/i, 'pool_private'],
  [/\b(community|shared|subdivision|resort)\s+pool\b/i, 'pool_shared'],
  [/\bpool\s+access\b/i, 'resort_pool'],
  [/\bpool\s+table|billiard/i, 'pool_table'],
  [/\bhot\s*tub|jacuzzi|whirlpool\b/i, 'hot_tub'],
  [/\barcade|game\s*room|foosball|air\s*hockey|ping\s*pong/i, 'arcade'],
  [/\b(home\s+)?theater|theatre|movie\s*room/i, 'theater'],
  [/\bfire\s*place|wood\s*burning|gas\s*log/i, 'fireplace'],
  [/\bmountain\s+view|scenic\s+view|panoramic/i, 'mountain_view'],
  [/\bpet\s*friendly|dog\s*friendly|pets\s+welcome/i, 'pet_friendly'],
  [/\bwi-?fi|internet/i, 'wifi'],
  [/\bfire\s*pit|fire\s*table/i, 'firepit'],
  [/\bsauna/i, 'sauna'],
  [/\bgrill|bbq|barbecue/i, 'grill'],
  [/\bwasher|dryer|laundry/i, 'washer_dryer'],
  [/\bev\s+charg|tesla\s+charg/i, 'ev_charger'],
  [/\bpool\b/i, 'pool_shared'], // fallback: bare "pool" is usually shared
];

/**
 * Towns within roughly 1.5 hours of Knoxville that plausibly have cabins.
 * Used both as a filter vocabulary and as a sanity check on scraped locality strings.
 */
export const TOWNS = [
  'Gatlinburg',
  'Pigeon Forge',
  'Sevierville',
  'Wears Valley',
  'Townsend',
  'Cosby',
  'Newport',
  'Douglas Lake',
  'Norris Lake',
  'Maryville',
  'Walland',
  'Seymour',
  'Dandridge',
  'Tellico Plains',
  'Lake City',
  'Pittman Center',
  'Kodak',
] as const;

/** Reasons offered when banning, so "why did we veto this" survives the year. */
export const BAN_REASONS = [
  'Too expensive',
  'Too far out',
  'Bad reviews',
  'Too small',
  'Ugly / dated',
  'Bad road / steep driveway',
  'Already stayed there',
  'No hot tub',
  'Other',
] as const;

export const BAN_SCOPES = [
  { value: 'listing', label: 'This listing', hint: 'Just this one cabin from this site' },
  { value: 'property', label: 'This cabin everywhere', hint: 'Hide it across every site it appears on' },
  { value: 'company', label: 'This whole company', hint: 'Never show anything from this rental company' },
] as const;

export const BAN_DURATIONS = [
  { value: 'season', label: 'This year only', hint: 'Comes back next Labor Day' },
  { value: 'forever', label: 'Forever', hint: 'Never show it again' },
] as const;

export type BanScope = (typeof BAN_SCOPES)[number]['value'];
export type BanDuration = (typeof BAN_DURATIONS)[number]['value'];

export const SORT_OPTIONS = [
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'rating', label: 'Best rated' },
  { value: 'sleeps', label: 'Sleeps most' },
  { value: 'distance', label: 'Closest to Knoxville' },
  { value: 'newest', label: 'Recently added' },
] as const;
