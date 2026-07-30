// Dry-run the generic-jsonld adapter against a real site without touching
// Supabase, so a config can be proven before it goes live.
//
//   npm run probe:generic -- https://www.hearthsidecabinrentals.com '^/cabins/([a-z0-9-]+)/?$' 8
//
// The third argument caps how many detail pages to fetch; keep it small.

import { genericJsonLd } from '../scrapers/adapters/generic-jsonld';
import { makeFetchers } from '../scrapers/http';
import type { AdapterContext, CompanyRow } from '../scrapers/types';

const EXCLUDE = '/(booking|confirmation|by-name|by-area|search|specials|reservations|thank-you)/?$';

async function main() {
  const [baseUrl, listingUrl, limitArg] = process.argv.slice(2);
  if (!baseUrl || !listingUrl) {
    console.error("Usage: npm run probe:generic -- <baseUrl> '<listingUrlRegex>' [limit]");
    process.exit(1);
  }
  const limit = Number(limitArg ?? 8);

  const company: CompanyRow = {
    id: 'probe',
    slug: new URL(baseUrl).hostname.replace(/^www\./, ''),
    name: 'probe',
    base_url: baseUrl.replace(/\/+$/, ''),
    adapter: 'generic-jsonld',
    adapter_kind: 'jsonld',
    config: { listingUrl, excludeUrl: EXCLUDE, maxListings: limit },
    crawl_delay_ms: 900,
    supports_availability: false,
  };

  const ctx: AdapterContext = {
    company,
    trip: { checkIn: '2026-09-04', checkOut: '2026-09-07', guests: 8, minBedrooms: 3 },
    ...makeFetchers({ crawlDelayMs: company.crawl_delay_ms }),
    log: (m) => console.log('  ' + m),
    deadline: Date.now() + 180_000,
    env: process.env,
  };

  console.log(`\nDry run: ${company.slug}  (fetching up to ${limit} detail pages)\n`);
  const listings = await genericJsonLd.listCatalog(ctx);

  console.log(`\n  Imported ${listings.length} listings:\n`);
  for (const l of listings) {
    console.log(
      `    ${(l.name ?? '').slice(0, 34).padEnd(34)} ` +
      `${String(l.bedrooms ?? '?').padStart(2)}br  sleeps ${String(l.sleeps ?? '?').padStart(2)}  ` +
      `${(l.town ?? '?').padEnd(14)} ` +
      `${l.nightlyRateFrom ? '$' + Math.round(l.nightlyRateFrom) : '—'}`.padEnd(7) +
      `  ${l.heroImageUrl ? 'img' : 'NO IMG'}  ${(l.amenities ?? []).slice(0, 4).join(',')}`,
    );
  }

  const withImage = listings.filter((l) => l.heroImageUrl).length;
  const withRooms = listings.filter((l) => l.bedrooms != null || l.sleeps != null).length;
  const withTown = listings.filter((l) => l.town).length;
  const withDrive = listings.filter((l) => l.driveMinutes != null).length;
  console.log(
    `\n  hero image ${withImage}/${listings.length}   rooms ${withRooms}/${listings.length}` +
    `   town ${withTown}/${listings.length}   drive time ${withDrive}/${listings.length}\n`,
  );
  if (listings.length === 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
