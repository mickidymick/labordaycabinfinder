// Maps a `companies.adapter` value to its implementation.
// Adding a source is either a new entry here, or — for anything that publishes
// schema.org data — just a `companies` row pointing at 'generic-jsonld'.

import type { SourceAdapter } from './types.ts';
import { elkSprings } from './adapters/elk-springs.ts';
import { genericJsonLd } from './adapters/generic-jsonld.ts';
import { apifyAirbnb, apifyVrbo } from './adapters/apify.ts';

/**
 * Sources we know exist but haven't reverse-engineered yet. They fail loudly
 * with an explanation rather than silently returning nothing, so a source that
 * is merely unbuilt never looks like a source that found no cabins. Their
 * `companies` rows ship disabled.
 */
function notImplemented(slug: string, detail: string): SourceAdapter {
  return {
    slug,
    async listCatalog() {
      throw new Error(`${slug} adapter is not implemented yet: ${detail}`);
    },
  };
}

export const ADAPTERS: Record<string, SourceAdapter> = {
  'elk-springs': elkSprings,
  'generic-jsonld': genericJsonLd,
  'apify-airbnb': apifyAirbnb,
  'apify-vrbo': apifyVrbo,

  trackhs: notImplemented(
    'trackhs',
    'Cabins of the Smoky Mountains runs on Track HS, but its unit/availability ' +
      'API is not exposed on the public site — the guessable /api/pms/units paths ' +
      'all 404 and the trackhs.com subdomain rejects the domain. Needs a look at ' +
      'the real booking-engine XHR traffic.',
  ),

  streamline: notImplemented(
    'streamline',
    'Bear Tootin runs on Streamline VRS behind an Angular front end that posts to ' +
      '/search-results/. Needs the request shape captured before this can be built.',
  ),
};

export function getAdapter(name: string): SourceAdapter {
  const adapter = ADAPTERS[name];
  if (!adapter) throw new Error(`Unknown adapter "${name}" — check companies.adapter`);
  return adapter;
}

export function hasAdapter(name: string): boolean {
  return name in ADAPTERS;
}
