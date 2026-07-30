// schema.org extraction. Every cabin site we looked at emits JSON-LD — usually
// an Accommodation or VacationRental node with bedrooms, occupancy and an
// amenityFeature list — which is far more stable than scraping their markup.
// Regex extraction keeps this dependency-free; we only ever read <script> blocks
// whose type is application/ld+json, so there's no HTML parsing to get wrong.

import type { RawListing } from './types';
import {
  absoluteUrl,
  extractAmenities,
  normalizeTownName,
  parseDecimal,
  parseInteger,
  parseMoney,
  stripHtml,
} from './normalize';

const LD_BLOCK = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

/** Every JSON-LD node on a page, with @graph containers flattened out. */
export function extractJsonLd(html: string): any[] {
  const nodes: any[] = [];
  for (const match of html.matchAll(LD_BLOCK)) {
    const raw = match[1].trim();
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue; // a malformed block shouldn't lose us the rest of the page
    }
    const stack = [parsed];
    while (stack.length) {
      const node = stack.pop();
      if (Array.isArray(node)) {
        stack.push(...node);
      } else if (node && typeof node === 'object') {
        nodes.push(node);
        const graph = (node as any)['@graph'];
        if (Array.isArray(graph)) stack.push(...graph);
      }
    }
  }
  return nodes;
}

function typesOf(node: any): string[] {
  const t = node?.['@type'];
  if (!t) return [];
  return (Array.isArray(t) ? t : [t]).map((x) => String(x));
}

export function nodesOfType(nodes: any[], ...wanted: string[]): any[] {
  const set = new Set(wanted.map((w) => w.toLowerCase()));
  return nodes.filter((n) => typesOf(n).some((t) => set.has(t.toLowerCase())));
}

/** Listing-ish schema.org types, most specific first. */
const LISTING_TYPES = [
  'VacationRental',
  'Accommodation',
  'House',
  'SingleFamilyResidence',
  'LodgingBusiness',
  'Product',
];

function firstString(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (Array.isArray(v)) {
      const s = firstString(...v);
      if (s) return s;
    }
    if (v && typeof v === 'object') {
      const o = v as any;
      const s = firstString(o.url, o.contentUrl, o.name, o['@id']);
      if (s) return s;
    }
  }
  return null;
}

function collectImages(node: any, base: string): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === 'string') {
      const u = absoluteUrl(base, v);
      if (u) out.push(u);
    } else if (Array.isArray(v)) {
      v.forEach(push);
    } else if (v && typeof v === 'object') {
      push((v as any).url ?? (v as any).contentUrl);
    }
  };
  push(node.image);
  push(node.photo);
  return [...new Set(out)];
}

function amenityNames(node: any): string[] {
  const feat = node.amenityFeature;
  if (!feat) return [];
  const list = Array.isArray(feat) ? feat : [feat];
  return list
    // LocationFeatureSpecification uses value:false to mean "does NOT have it".
    .filter((f) => f?.value !== false)
    .map((f) => (typeof f === 'string' ? f : f?.name))
    .filter((n): n is string => typeof n === 'string');
}

function priceOf(node: any): number | null {
  const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
  return (
    parseMoney(offer?.price) ??
    parseMoney(offer?.lowPrice) ??
    parseMoney(offer?.priceSpecification?.price) ??
    parseMoney(node.priceRange) ??
    null
  );
}

/**
 * Fold every listing-ish node on a page into one RawListing. Detail pages often
 * split the data — an Accommodation with the room counts and a separate Product
 * with the price and rating — so we merge rather than picking one node.
 */
export function listingFromPage(
  html: string,
  pageUrl: string,
  sourceListingId: string,
): RawListing | null {
  const nodes = extractJsonLd(html);
  const candidates = nodesOfType(nodes, ...LISTING_TYPES);
  if (candidates.length === 0) return null;

  // A LodgingBusiness node on a detail page is usually the rental company
  // itself, not the cabin. Only fall back to it if nothing better exists.
  const specific = candidates.filter(
    (n) => !typesOf(n).some((t) => t.toLowerCase() === 'lodgingbusiness'),
  );
  const use = specific.length ? specific : candidates;

  const merged: RawListing = {
    sourceListingId,
    name: '',
    url: pageUrl,
    imageUrls: [],
    amenities: [],
  };
  const amenityText: string[] = [];
  let bestDescription: string | null = null;

  for (const node of use) {
    merged.name ||= firstString(node.name, node.headline) ?? '';

    const desc = stripHtml(firstString(node.description));
    if (desc && (!bestDescription || desc.length > bestDescription.length)) {
      bestDescription = desc;
    }

    merged.imageUrls = [...new Set([...(merged.imageUrls ?? []), ...collectImages(node, pageUrl)])];

    const addr = node.address ?? {};
    merged.town ??= normalizeTownName(firstString(addr.addressLocality, node.addressLocality));

    const geo = node.geo ?? {};
    merged.lat ??= parseDecimal(geo.latitude ?? node.latitude);
    merged.lng ??= parseDecimal(geo.longitude ?? node.longitude);

    merged.bedrooms ??= parseInteger(node.numberOfBedrooms ?? node.numberOfRooms);
    merged.bathrooms ??= parseDecimal(
      node.numberOfFullBathrooms ?? node.numberOfBathroomsTotal ?? node.numberOfBathrooms,
    );
    merged.sleeps ??= parseInteger(
      node.occupancy?.value ?? node.occupancy?.maxValue ?? node.occupancy,
    );

    amenityText.push(...amenityNames(node));

    merged.nightlyRateFrom ??= priceOf(node);

    const rating = node.aggregateRating;
    if (rating) {
      merged.rating ??= parseDecimal(rating.ratingValue);
      merged.reviewCount ??= parseInteger(rating.reviewCount ?? rating.ratingCount);
    }
  }

  if (!merged.name) return null;

  merged.description = bestDescription;
  merged.heroImageUrl = merged.imageUrls?.[0] ?? null;
  merged.amenities = extractAmenities(amenityText, bestDescription);
  return merged;
}

/**
 * Listings straight from an index page's ItemList (Elk Springs and several
 * others publish one). Cheap when available — no per-cabin request needed.
 */
export function listingsFromItemList(html: string, pageUrl: string): RawListing[] {
  const nodes = extractJsonLd(html);
  const out: RawListing[] = [];

  for (const list of nodesOfType(nodes, 'ItemList')) {
    const elements = Array.isArray(list.itemListElement) ? list.itemListElement : [];
    for (const el of elements) {
      const item = el?.item ?? el;
      if (!item || typeof item !== 'object') continue;

      const url = firstString(item.url, item['@id']);
      const name = firstString(item.name);
      if (!url || !name) continue;

      const absolute = absoluteUrl(pageUrl, url);
      if (!absolute) continue;

      out.push({
        sourceListingId: absolute,
        name,
        url: absolute,
        heroImageUrl: collectImages(item, pageUrl)[0] ?? null,
        imageUrls: collectImages(item, pageUrl),
        description: stripHtml(firstString(item.description)),
        town: normalizeTownName(firstString(item.address?.addressLocality)),
        lat: parseDecimal(item.geo?.latitude),
        lng: parseDecimal(item.geo?.longitude),
        bedrooms: parseInteger(item.numberOfBedrooms),
        sleeps: parseInteger(item.occupancy?.value ?? item.occupancy),
        amenities: extractAmenities(amenityNames(item), firstString(item.description)),
        nightlyRateFrom: priceOf(item),
        rating: parseDecimal(item.aggregateRating?.ratingValue),
        reviewCount: parseInteger(
          item.aggregateRating?.reviewCount ?? item.aggregateRating?.ratingCount,
        ),
      });
    }
  }
  return out;
}

/** <loc> entries from a sitemap or sitemap index. */
export function urlsFromSitemap(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
}

export function isSitemapIndex(xml: string): boolean {
  return /<sitemapindex/i.test(xml);
}
