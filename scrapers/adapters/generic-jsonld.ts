// Config-driven adapter for the rental companies that publish schema.org data.
// Adding one of these is a row in `companies`, not a new module:
//
//   config: {
//     "sitemap":     "/sitemap.xml",            // optional, discovered if omitted
//     "listingUrl":  "-cabin-rental-(\\d+)\\.php$",  // regex; group 1 = source id
//     "indexPath":   "/cabins/"                 // optional ItemList shortcut
//   }
//
// Verified against Cabins USA, whose listing URLs look like
//   /vacation-cabin-rental/sevierville/douglas-lake/cabin-on-the-lake-cabin-rental-1161.php
// and whose detail pages carry an Accommodation node with numberOfBedrooms,
// occupancy and a full amenityFeature list.
//
// These sources are catalog-only: none of them expose a dated availability API,
// so `supports_availability` is false and the UI shows "check their site".

import type { AdapterContext, RawListing, SourceAdapter } from '../types';
import { outOfTime } from '../types';
import {
  isSitemapIndex,
  listingFromPage,
  listingsFromItemList,
  urlsFromSitemap,
} from '../jsonld';
import { resolveDriveMinutes } from '../../lib/geo';

type GenericConfig = {
  sitemap?: string;
  listingUrl?: string;
  indexPath?: string;
  maxListings?: number;
};

const DEFAULT_MAX_LISTINGS = 400;

async function discoverSitemapUrls(ctx: AdapterContext): Promise<string[]> {
  const base = ctx.company.base_url;
  const cfg = ctx.company.config as GenericConfig;
  const candidates = cfg.sitemap
    ? [new URL(cfg.sitemap, base).toString()]
    : [`${base}/sitemap.xml`, `${base}/sitemap_index.xml`];

  for (const url of candidates) {
    try {
      const xml = await ctx.fetchText(url);
      if (!isSitemapIndex(xml)) return urlsFromSitemap(xml);

      // Sitemap index: pull the child sitemaps, but don't walk the whole site.
      const children = urlsFromSitemap(xml).slice(0, 12);
      const all: string[] = [];
      for (const child of children) {
        if (outOfTime(ctx)) break;
        try {
          all.push(...urlsFromSitemap(await ctx.fetchText(child)));
        } catch {
          /* one bad child sitemap shouldn't sink the crawl */
        }
      }
      if (all.length) return all;
    } catch {
      /* try the next candidate */
    }
  }
  return [];
}

export const genericJsonLd: SourceAdapter = {
  slug: 'generic-jsonld',

  async listCatalog(ctx: AdapterContext): Promise<RawListing[]> {
    const base = ctx.company.base_url;
    const cfg = ctx.company.config as GenericConfig;
    const max = cfg.maxListings ?? DEFAULT_MAX_LISTINGS;

    // Fast path: an index page with an ItemList gives us everything in one request.
    if (cfg.indexPath) {
      try {
        const indexUrl = new URL(cfg.indexPath, base).toString();
        const found = listingsFromItemList(await ctx.fetchText(indexUrl), indexUrl);
        if (found.length > 0) {
          ctx.log(`${ctx.company.slug}: ${found.length} listings from ItemList`);
          return found.slice(0, max).map(withDriveTime);
        }
      } catch (e) {
        ctx.log(`${ctx.company.slug}: ItemList path failed, falling back to sitemap`, {
          error: String(e),
        });
      }
    }

    // Sitemap path: find the detail pages, then read JSON-LD off each one.
    const pattern = cfg.listingUrl ? new RegExp(cfg.listingUrl) : null;
    if (!pattern) {
      throw new Error(
        `${ctx.company.slug}: config.listingUrl is required when no ItemList index is configured`,
      );
    }

    const urls = [...new Set(await discoverSitemapUrls(ctx))].filter((u) => pattern.test(u));
    ctx.log(`${ctx.company.slug}: ${urls.length} listing URLs in sitemap`);
    if (urls.length === 0) return [];

    const listings: RawListing[] = [];
    let failures = 0;

    for (const url of urls.slice(0, max)) {
      if (outOfTime(ctx)) {
        ctx.log(`${ctx.company.slug}: out of time at ${listings.length}/${urls.length}`);
        break;
      }
      // Group 1 of the pattern is the stable id; fall back to the URL itself.
      const id = pattern.exec(url)?.[1] ?? url;
      try {
        const listing = listingFromPage(await ctx.fetchText(url), url, id);
        if (listing) listings.push(withDriveTime(listing));
      } catch {
        failures++;
      }
    }

    if (failures) ctx.log(`${ctx.company.slug}: ${failures} detail pages failed`);
    return listings;
  },
};

function withDriveTime(listing: RawListing): RawListing {
  return {
    ...listing,
    driveMinutes: resolveDriveMinutes(
      { lat: listing.lat ?? null, lng: listing.lng ?? null },
      listing.town ?? null,
    ),
  };
}

export default genericJsonLd;
