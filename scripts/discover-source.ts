// Works out how to scrape a rental company's site, so adding a source is a
// measurement rather than a guess.
//
//   npm run discover -- https://www.hearthsidecabinrentals.com
//
// It finds the sitemap, clusters the URLs by path shape, then fetches a sample
// page from each promising cluster and runs the real JSON-LD extractor over it.
// Clusters are scored by how much usable listing data actually comes back, and
// the winner is printed as a ready-to-paste `companies` row.
//
// Guessing a listingUrl regex is how sources end up silently returning nothing,
// which is indistinguishable from a site having no cabins. This checks instead.

import { makeFetchers } from '../scrapers/http';
import { isSitemapIndex, listingFromPage, listingsFromItemList, urlsFromSitemap } from '../scrapers/jsonld';
import type { RawListing } from '../scrapers/types';

const base = (process.argv[2] ?? '').replace(/\/+$/, '');
if (!base) {
  console.error('Usage: npm run discover -- https://www.example.com');
  process.exit(1);
}

const { fetchText } = makeFetchers({ crawlDelayMs: 800, timeoutMs: 25_000 });

/** Collapse a URL to a shape so sibling listing pages group together. */
function shapeOf(url: string): string {
  const { pathname } = new URL(url);
  return pathname
    .split('/')
    .filter(Boolean)
    .map((seg) =>
      /^\d+$/.test(seg) ? '<num>'
        : /\d{3,}/.test(seg) ? '<slug-num>'
        : /^[a-z0-9]+(-[a-z0-9]+){1,}(\.php|\.html)?$/i.test(seg) ? '<slug>'
        : seg,
    )
    .join('/');
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const WILDCARD = '[^/]+';

/** Assemble a path regex from explicit prefix segments. */
function buildRegex(prefix: string[], lastShape: string | undefined, ext: string): string {
  const head = `^/${prefix.length ? prefix.join('/') + '/' : ''}`;
  // A trailing number is a far more stable id than the slug around it.
  if (lastShape === '<slug-num>') return `${head}[^/]*?-(\\d+)${ext}$`;
  return `${head}([a-z0-9-]+)${ext}/?$`;
}

/**
 * Per-prefix-position: the single literal value if the cluster agrees on one,
 * otherwise the values ranked by frequency. A section name like /cabin-rental/
 * is fixed and belongs in the pattern literally; a town segment varies and has
 * to be a wildcard. Deriving this from one sample either over-fits (matching a
 * single town) or under-fits (matching unrelated pages).
 */
function prefixOptions(urls: string[]): { constant: string | null; ranked: string[] }[] {
  const segLists = urls.map((u) => new URL(u).pathname.replace(/\/+$/, '').split('/').filter(Boolean));
  const width = Math.min(...segLists.map((s) => s.length));
  const out: { constant: string | null; ranked: string[] }[] = [];

  for (let i = 0; i < width - 1; i++) {
    const counts = new Map<string, number>();
    for (const segs of segLists) counts.set(segs[i], (counts.get(segs[i]) ?? 0) + 1);
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
    out.push({ constant: counts.size === 1 ? ranked[0] : null, ranked });
  }
  return out;
}

function extensionOf(urls: string[]): string {
  const m = /\.(php|html)$/.exec(new URL(urls[0]).pathname);
  return m ? escape(m[0]) : '';
}

function score(l: RawListing | null): number {
  if (!l) return 0;
  let n = 0;
  if (l.name) n += 2;
  if (l.heroImageUrl) n += 2;
  if (l.bedrooms != null) n += 2;
  if (l.sleeps != null) n += 2;
  if (l.town) n += 1;
  if ((l.amenities?.length ?? 0) > 0) n += 1;
  if (l.nightlyRateFrom != null) n += 1;
  if (l.rating != null) n += 1;
  return n;
}

async function sitemapUrls(): Promise<string[]> {
  const candidates: string[] = [];
  try {
    const robots = await fetchText(`${base}/robots.txt`);
    for (const m of robots.matchAll(/^\s*sitemap:\s*(\S+)/gim)) candidates.push(m[1]);
  } catch { /* robots is optional */ }
  candidates.push(`${base}/sitemap.xml`, `${base}/sitemap_index.xml`);

  for (const candidate of [...new Set(candidates)]) {
    try {
      const xml = await fetchText(candidate);
      if (!isSitemapIndex(xml)) {
        const urls = urlsFromSitemap(xml);
        if (urls.length) {
          console.log(`  sitemap: ${candidate} (${urls.length} urls)`);
          return urls;
        }
        continue;
      }
      const children = urlsFromSitemap(xml);
      console.log(`  sitemap index: ${candidate} (${children.length} children)`);
      const all: string[] = [];
      for (const child of children.slice(0, 15)) {
        try { all.push(...urlsFromSitemap(await fetchText(child))); } catch { /* skip */ }
      }
      if (all.length) {
        console.log(`  collected ${all.length} urls from children`);
        return all;
      }
    } catch { /* try next */ }
  }
  return [];
}

async function main() {
  console.log(`\nDiscovering ${base}\n`);

  const urls = (await sitemapUrls()).filter((u) => {
    try { return new URL(u).host === new URL(base).host; } catch { return false; }
  });

  if (urls.length === 0) {
    console.log('  No sitemap found. This site needs a hand-written adapter.\n');
    process.exit(1);
  }

  // Group by shape, ignoring obvious non-listing sections.
  const NOISE = /\/(blog|news|events|guest-reviews|reviews|tag|category|author|page|specials|area|amenity|bedroom|city)\//i;
  const groups = new Map<string, string[]>();
  for (const u of urls) {
    if (NOISE.test(u)) continue;
    const shape = shapeOf(u);
    if (!shape.includes('<')) continue; // listing pages have a variable segment
    (groups.get(shape) ?? groups.set(shape, []).get(shape)!).push(u);
  }

  const candidates = [...groups.entries()]
    .filter(([, list]) => list.length >= 8) // a real cabin inventory, not a stray page
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 6);

  if (candidates.length === 0) {
    console.log('  No URL cluster looked like a cabin inventory.\n');
    process.exit(1);
  }

  console.log(`\n  Candidate URL clusters:\n`);
  for (const [shape, list] of candidates) {
    console.log(`    ${String(list.length).padStart(4)}  /${shape}`);
  }

  console.log(`\n  Sampling one page per cluster...\n`);

  const results: { shape: string; count: number; score: number; sample: string; listing: RawListing | null }[] = [];
  for (const [shape, list] of candidates) {
    const sample = list[Math.floor(list.length / 2)];
    try {
      const html = await fetchText(sample);
      const listing = listingFromPage(html, sample, 'probe');
      const s = score(listing);
      results.push({ shape, count: list.length, score: s, sample, listing });
      console.log(
        `    /${shape}\n      score ${s}/12  ${listing ? `"${listing.name}"` : 'no listing JSON-LD'}` +
        (listing ? `  ${listing.bedrooms ?? '?'}br sleeps ${listing.sleeps ?? '?'}  ${listing.town ?? '?'}` : ''),
      );
    } catch (e) {
      console.log(`    /${shape}\n      fetch failed: ${e instanceof Error ? e.message : e}`);
      results.push({ shape, count: list.length, score: 0, sample, listing: null });
    }
  }

  // Does an index page expose an ItemList? That's cheaper than per-page fetches.
  console.log(`\n  Checking for an ItemList index...`);
  for (const path of ['/cabins/', '/cabin-rentals/', '/rentals/', '/properties/', '/']) {
    try {
      const html = await fetchText(`${base}${path}`);
      const found = listingsFromItemList(html, `${base}${path}`);
      if (found.length >= 5) {
        console.log(`    ${path} -> ItemList with ${found.length} listings (use "indexPath": "${path}")`);
        break;
      }
    } catch { /* not there */ }
  }

  const best = results.filter((r) => r.score >= 6).sort((a, b) => b.score - a.score || b.count - a.count)[0];

  console.log('\n' + '='.repeat(72));
  if (!best) {
    console.log('\n  No cluster produced usable listing data. Either the detail pages');
    console.log('  carry no schema.org markup, or this site needs a custom adapter.\n');
    process.exit(1);
  }

  const cluster = groups.get(best.shape) ?? [];
  const pathOf = (u: string) => new URL(u).pathname;

  // A cluster can still mix real listings with category pages (e.g.
  // /cabin-rental/<name>/ alongside /cabin-rentals/<category>/), which forces a
  // [^/]+ where a literal belongs. Generate tightened variants and pick a
  // winner by actually fetching pages, rather than trusting URL shape alone.
  const lastShape = best.shape.split('/').pop();
  const ext = extensionOf(cluster);
  const options = prefixOptions(cluster);

  // Baseline: literal where the cluster agrees, wildcard where it doesn't.
  const baseline = options.map((o) => (o.constant ? escape(o.constant) : WILDCARD));
  const variants = new Set<string>([buildRegex(baseline, lastShape, ext)]);

  // Then one tightened variant per varying position, pinning it to that
  // position's most common value.
  options.forEach((o, i) => {
    if (o.constant) return;
    const tightened = [...baseline];
    tightened[i] = escape(o.ranked[0]);
    variants.add(buildRegex(tightened, lastShape, ext));
  });

  console.log(`\n  Evaluating ${variants.size} pattern variant(s) by sampling real pages...\n`);

  const SAMPLES = 4;
  type Verdict = { regex: string; matched: number; hits: number; sampled: number };
  const verdicts: Verdict[] = [];

  for (const candidate of variants) {
    const re = new RegExp(candidate);
    const matched = urls.filter((u) => re.test(pathOf(u)));
    if (matched.length === 0) continue;

    const step = Math.max(1, Math.floor(matched.length / SAMPLES));
    const picks = Array.from({ length: Math.min(SAMPLES, matched.length) }, (_, k) => matched[k * step]);
    let hits = 0;
    for (const u of picks) {
      try {
        const l = listingFromPage(await fetchText(u), u, 'probe');
        // Same bar the adapter applies: a name alone isn't a cabin.
        if (l?.name && (l.bedrooms != null || l.sleeps != null)) hits++;
      } catch { /* counts as a miss */ }
    }
    verdicts.push({ regex: candidate, matched: matched.length, hits, sampled: picks.length });
    console.log(
      `    ${String(hits) + '/' + picks.length} sampled pages are real cabins   ` +
      `${String(matched.length).padStart(4)} urls match   ${candidate}`,
    );
  }

  // Precision first — a loose pattern wastes fetches and pollutes the grid —
  // then breadth.
  const winner = verdicts.sort(
    (a, b) => b.hits / b.sampled - a.hits / a.sampled || b.matched - a.matched,
  )[0];

  console.log(`\n  Best cluster: /${best.shape}  (${best.count} pages, page score ${best.score}/12)`);
  console.log(`  Sample:       ${best.sample}`);

  if (!winner || winner.hits === 0) {
    console.log('\n  No pattern reliably selected cabin pages. Needs a custom adapter.\n');
    return;
  }

  const clean = winner.hits === winner.sampled;
  console.log(`\n  ${clean ? 'READY' : 'USABLE (some matched pages are not cabins)'}`);
  console.log(`  ~${winner.matched} listing URLs, ${winner.hits}/${winner.sampled} sampled verified\n`);
  console.log(`    '{"listingUrl": "${winner.regex.replace(/\\/g, '\\\\')}"}'::jsonb\n`);
  if (!clean) {
    console.log('  Non-cabin pages are dropped at import by the adapter\'s room-count');
    console.log('  check, so they cost a wasted fetch but never become listings.\n');
  }

}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
