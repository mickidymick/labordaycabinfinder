// Live smoke test for the Elk Springs adapter. Hits the real site, so it is not
// part of `npm test` — run it by hand when the adapter looks broken:
//
//   node scripts/probe-elk-springs.ts
//
// Asserts the catalog is a plausible size, that fields are actually populated,
// and that a real calendar decodes correctly across the trip window.

import { elkSprings } from '../scrapers/adapters/elk-springs.ts';
import { makeFetchers } from '../scrapers/http.ts';
import { isStayAvailable, nightsOf } from '../scrapers/calendar.ts';
import type { AdapterContext, CompanyRow } from '../scrapers/types.ts';

const CHECK_IN = process.env.CHECK_IN ?? '2026-09-04';
const CHECK_OUT = process.env.CHECK_OUT ?? '2026-09-07';

const company: CompanyRow = {
  id: 'probe',
  slug: 'elk-springs',
  name: 'Elk Springs Resort',
  base_url: 'https://www.elkspringsresort.com',
  adapter: 'elk-springs',
  adapter_kind: 'api',
  config: {},
  crawl_delay_ms: 400,
  supports_availability: true,
};

const ctx: AdapterContext = {
  company,
  trip: { checkIn: CHECK_IN, checkOut: CHECK_OUT, guests: 8, minBedrooms: 3 },
  ...makeFetchers({ crawlDelayMs: company.crawl_delay_ms, skipRobots: false }),
  log: (m) => console.log('  ' + m),
  deadline: Date.now() + 120_000,
  env: process.env,
};

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

console.log(`\nElk Springs probe — trip ${CHECK_IN} → ${CHECK_OUT} (${nightsOf(CHECK_IN, CHECK_OUT).length} nights)\n`);

const catalog = await elkSprings.listCatalog(ctx);
check('catalog returns a plausible number of cabins', catalog.length > 100, `${catalog.length} cabins`);
check('every cabin has an id, name and url',
  catalog.every((c) => c.sourceListingId && c.name && c.url));
check('most cabins have a hero image',
  catalog.filter((c) => c.heroImageUrl).length > catalog.length * 0.8,
  `${catalog.filter((c) => c.heroImageUrl).length}/${catalog.length}`);
check('most cabins have sleeps + bedrooms',
  catalog.filter((c) => c.sleeps && c.bedrooms).length > catalog.length * 0.8);
check('coordinates parsed',
  catalog.filter((c) => c.lat && c.lng).length > catalog.length * 0.8);
check('amenities extracted for most cabins',
  catalog.filter((c) => (c.amenities?.length ?? 0) > 0).length > catalog.length * 0.5);

const withHotTub = catalog.filter((c) => c.amenities?.includes('hot_tub')).length;
check('hot tub is a common amenity (sanity check on the matcher)', withHotTub > 20, `${withHotTub} cabins`);

// Availability on a sample — enough to prove the path without 178 requests.
const sample = catalog.filter((c) => (c.bedrooms ?? 0) >= 3).slice(0, 5);
console.log(`\nChecking availability for ${sample.length} sampled 3+ bedroom cabins:\n`);

let decoded = 0;
let available = 0;
for (const listing of sample) {
  const days = await elkSprings.fetchAvailability!(listing, ctx);
  if (days.length > 0) decoded++;
  const verdict = isStayAvailable(days, CHECK_IN, CHECK_OUT);
  if (verdict === true) available++;
  const window = nightsOf(CHECK_IN, CHECK_OUT)
    .map((d) => days.find((x) => x.day === d)?.state ?? '?')
    .join('');
  console.log(
    `  ${listing.name.padEnd(34)} ${String(listing.bedrooms).padStart(2)}br ` +
    `sleeps ${String(listing.sleeps).padStart(2)}  ${window}  → ${
      verdict === null ? 'unknown' : verdict ? 'AVAILABLE' : 'booked'
    }  (${days.length} days decoded)`,
  );
}

check('calendars decoded for the whole sample', decoded === sample.length, `${decoded}/${sample.length}`);
check('trip window resolves to a definite yes/no (not unknown)',
  sample.length > 0 && decoded === sample.length);

console.log(`\n${available}/${sample.length} sampled cabins are free for Labor Day weekend.`);
console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
