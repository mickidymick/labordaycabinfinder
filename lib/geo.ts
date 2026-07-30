// Distance helpers. We approximate "1.5 hours from Knoxville" with a straight-line
// radius rather than a routing API — good enough to exclude Asheville and Chattanooga
// without adding a paid dependency. Swap in Google Distance Matrix later if the
// mountain roads make the approximation too generous.

export const KNOXVILLE = { lat: 35.9606, lng: -83.9207 };

/** Great-circle distance in miles. */
export function haversineMiles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function milesFromKnoxville(p: { lat: number; lng: number }): number {
  return haversineMiles(KNOXVILLE, p);
}

/**
 * Straight-line miles → estimated drive minutes. The 1.35 factor accounts for the
 * fact that nothing in the Smokies is a straight line; 42 mph is a realistic blended
 * average across I-40, the spur, and mountain two-lanes.
 */
export function estimateDriveMinutes(miles: number): number {
  return Math.round(((miles * 1.35) / 42) * 60);
}

export function driveMinutesFromKnoxville(p: { lat: number; lng: number }): number {
  return estimateDriveMinutes(milesFromKnoxville(p));
}

/**
 * Fallback drive times for listings with no coordinates, keyed by normalized town.
 * Measured from downtown Knoxville.
 */
export const TOWN_DRIVE_MINUTES: Record<string, number> = {
  seymour: 25,
  maryville: 25,
  kodak: 25,
  sevierville: 35,
  dandridge: 40,
  walland: 40,
  'pigeon forge': 45,
  townsend: 50,
  'norris lake': 50,
  'lake city': 50,
  'douglas lake': 55,
  'wears valley': 55,
  gatlinburg: 60,
  'pittman center': 65,
  newport: 65,
  cosby: 75,
  'tellico plains': 75,
};

export function normalizeTown(town: string | null | undefined): string | null {
  if (!town) return null;
  return town.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Best-effort drive time: coordinates if we have them, else the town table. */
export function resolveDriveMinutes(
  coords: { lat: number | null; lng: number | null },
  town: string | null,
): number | null {
  if (coords.lat != null && coords.lng != null) {
    return driveMinutesFromKnoxville({ lat: coords.lat, lng: coords.lng });
  }
  const key = normalizeTown(town);
  return key ? (TOWN_DRIVE_MINUTES[key] ?? null) : null;
}
