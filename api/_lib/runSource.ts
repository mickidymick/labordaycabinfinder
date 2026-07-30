// Runs one source end to end: catalog (or dated search), then availability,
// then writes everything to Supabase. Shared by the on-demand search fan-out
// and the nightly warm cron, which differ only in how much time they're given
// and which listings they prioritize.

import { getAdapter } from '../../scrapers/registry';
import { makeFetchers } from '../../scrapers/http';
import { MissingApifyTokenError } from '../../scrapers/adapters/apify';
import { isStayAvailable } from '../../scrapers/calendar';
import type { AdapterContext, CompanyRow, DayAvailability, RawListing, TripWindow } from '../../scrapers/types';
import { db, markSource, upsertAvailability, upsertListings } from './db';

export type RunOptions = {
  company: CompanyRow;
  trip: TripWindow;
  /** Absolute wall-clock deadline for this source. */
  deadline: number;
  /** Cap on calendar fetches; the rest keep whatever they already had cached. */
  maxAvailabilityFetches?: number;
  /** Progress reporting target. Omit for the cron, which has no run to update. */
  runId?: string;
};

export type RunResult = {
  found: number;
  available: number;
  skipped?: string;
};

export class SourceSkipped extends Error {}

/**
 * Which listings are worth spending a calendar request on. The trip's static
 * criteria eliminate most of a company's inventory before we ever ask about
 * dates — for a 3-bedroom, sleeps-8 trip that's typically half of them — and
 * the stalest go first so repeated runs converge on full coverage.
 */
async function prioritizeForAvailability(
  companyId: string,
  listings: RawListing[],
  ids: Map<string, string>,
  trip: TripWindow,
  limit: number,
): Promise<RawListing[]> {
  const eligible = listings.filter((l) => {
    if (trip.minBedrooms != null && (l.bedrooms ?? 0) < trip.minBedrooms) return false;
    if (trip.guests != null && l.sleeps != null && l.sleeps < trip.guests) return false;
    return true;
  });

  // Refresh the least recently verified first.
  const { data } = await db()
    .from('listings')
    .select('id, verified_at')
    .eq('company_id', companyId);
  const verifiedAt = new Map((data ?? []).map((r) => [r.id, r.verified_at as string | null]));

  return eligible
    .sort((a, b) => {
      const av = verifiedAt.get(ids.get(a.sourceListingId) ?? '') ?? '';
      const bv = verifiedAt.get(ids.get(b.sourceListingId) ?? '') ?? '';
      return av.localeCompare(bv); // '' (never verified) sorts first
    })
    .slice(0, limit);
}

export async function runSource(opts: RunOptions): Promise<RunResult> {
  const { company, trip, deadline, runId } = opts;
  const adapter = getAdapter(company.adapter);

  const ctx: AdapterContext = {
    company,
    trip,
    ...makeFetchers({
      crawlDelayMs: company.crawl_delay_ms,
      // First-party JSON APIs we were pointed at by the site's own front end
      // don't need a robots round-trip on every call.
      skipRobots: company.adapter_kind === 'apify',
    }),
    log: (msg, extra) => console.log(`[${company.slug}] ${msg}`, extra ?? ''),
    deadline,
    env: process.env as Record<string, string | undefined>,
  };

  if (runId) {
    await markSource(runId, company.id, {
      status: 'running',
      started_at: new Date().toISOString(),
    });
  }

  let listings: RawListing[];
  try {
    // A dated search returns only bookable results and needs no warm pass.
    listings = adapter.searchLive
      ? await adapter.searchLive(ctx)
      : await adapter.listCatalog(ctx);
  } catch (e) {
    if (e instanceof MissingApifyTokenError) throw new SourceSkipped(e.message);
    throw e;
  }

  const ids = await upsertListings(company.id, listings);

  // Availability arrives one of three ways: inlined by the adapter (Apify,
  // which already filtered by date), fetched per listing (Elk Springs), or not
  // at all (catalog-only sources, which stay "unknown" rather than "unavailable").
  const collected: { days: DayAvailability[] }[] = [];

  const inlined = listings.filter((l) => l.availability?.length);
  for (const listing of inlined) {
    const id = ids.get(listing.sourceListingId);
    if (!id) continue;
    await upsertAvailability(id, listing.availability!, trip);
    collected.push({ days: listing.availability! });
  }

  if (adapter.fetchAvailability) {
    const limit = opts.maxAvailabilityFetches ?? 40;
    const needing = listings.filter((l) => !l.availability?.length);
    const targets = await prioritizeForAvailability(company.id, needing, ids, trip, limit);
    ctx.log(`fetching calendars for ${targets.length}/${needing.length} listings`);

    const verifiedIds: string[] = [];
    for (const listing of targets) {
      if (Date.now() > deadline) {
        ctx.log(`stopping calendar fetches at ${collected.length} — out of time`);
        break;
      }
      const id = ids.get(listing.sourceListingId);
      if (!id) continue;
      try {
        const days = await adapter.fetchAvailability(listing, ctx);
        if (days.length) {
          await upsertAvailability(id, days, trip);
          collected.push({ days });
          verifiedIds.push(id);
        }
      } catch (e) {
        ctx.log(`calendar fetch failed for ${listing.name}`, { error: String(e) });
      }
    }

    if (verifiedIds.length) {
      await db()
        .from('listings')
        .update({ verified_at: new Date().toISOString() })
        .in('id', verifiedIds);
    }
  }

  const available = collected.filter(
    ({ days }) => isStayAvailable(days, trip.checkIn, trip.checkOut) === true,
  ).length;

  return { found: listings.length, available };
}
