# Labor Day Cabin Finder

A private site for a handful of friends planning the yearly Labor Day cabin trip in the
Smokies. Sign in with Google, edit one shared trip config, hit **Search**, and get a grid
of cabins from every rental company at once — with a hero photo, a link to book, and the
ability to veto a cabin so nobody has to relitigate it next year.

Search area is roughly 1.5 hours from Knoxville: Gatlinburg, Pigeon Forge, Sevierville,
Wears Valley, Townsend, Cosby and the lakes.

Same stack as [`../mcmichael-munchies`](../mcmichael-munchies): Expo (React Native Web) +
expo-router, Supabase, Vercel.

## Tech Stack

| Technology | Purpose |
|---|---|
| [Expo](https://expo.dev) + expo-router | React Native Web app, file-based routing |
| [Supabase](https://supabase.com/dashboard) | Google auth, Postgres, RLS, Realtime |
| [Vercel](https://vercel.com/dashboard) | Static hosting **and** the scraper functions (`api/`) |
| [Apify](https://apify.com) | Airbnb / Vrbo actors (optional — those two block direct crawling) |

## How it works

```
Expo web SPA  ──POST /api/search──▶  Vercel Function (fan-out)
      │                                      │
      │                             one invocation per source
      │                                      │
      └── Supabase Realtime ◀────── writes rows as each finishes
                                             │
                                      Supabase Postgres
                                             ▲
                             nightly cron ───┘  (/api/cron/warm)
```

Scraping is two-tiered, because availability is per-cabin and a company with a few hundred
cabins can't be crawled inside one 60-second request:

- **Warm tier** (`/api/cron/warm`, nightly) walks every source and upserts catalogs and
  availability calendars into Postgres. Slow, polite, invisible.
- **Hot tier** (`/api/search`, on demand) filters the warm cache instantly, then re-verifies
  the calendars most likely to matter and fires the Apify actors. Each source is a separate
  function invocation with its own time budget, and results stream into the grid over
  Realtime as they land — so the button responds immediately.

## What "availability" actually means

Not every source can answer date questions, and the UI is explicit about which is which:

| Source | Catalog | Real dated availability |
|---|---|---|
| **Elk Springs Resort** | ✅ 178 cabins, one request | ✅ per-cabin calendar bitmap |
| **Airbnb / Vrbo** (via Apify) | — | ✅ the actor filters by date |
| **Cabins USA** | ✅ ~264 cabins | ❌ no queryable calendar |
| **Timber Tops** | ✅ ~220 cabins | ❌ |
| **Hearthside** | ✅ ~159 cabins | ❌ |
| **Summit** | ✅ ~114 cabins | ❌ |
| Cabins of the Smokies (Track HS), Bear Tootin (Streamline) | ❌ adapter not built | ❌ |
| ~~Volunteer Cabin Rentals~~ | 🚫 Cloudflare bot challenge — not crawled | — |

Roughly 735 cabins across the five working sources. Only Elk Springs (and the
Apify actors, once enabled) can answer date questions; the rest are catalog-only.

None of the four `generic-jsonld` sites publish occupancy in their markup, so
`sleeps` is null for them and the group-size filter can't apply — filter on
bedrooms instead. Bedrooms, town, coordinates, hero image, amenities and rating
all come through.

A cabin is therefore in one of **three** states, not two: free, booked, or *unknown*.
Unknown is not a rejection — most company sites publish no calendar we can query, and
hiding those would throw away most of the inventory. Those cards say "Check dates" and
link straight to the listing.

### The calendar format

Elk Springs returns availability as a run-length string with a start date:

```
calendar_start_date = "2026-07-30"
calendar_string     = "UUIAAAAOUUIAAOUUUIAO..."
                       A=available  U=unavailable  I=check-in  O=check-out
```

A bookable window reads `I A A A O` — you arrive on the `I` and leave on the `O`. **`O` is
not a bookable night**: an existing guest departs that morning. Treating "anything but `U`"
as free silently reports booked cabins as available, so both `scrapers/calendar.ts`
(`BOOKABLE_NIGHT`) and the `listing_available()` SQL function require `A` or `I`. Change
one, change the other — `scrapers/calendar.test.ts` pins the behavior against a real
captured calendar.

## Project Structure

```
app/
  _layout.tsx          # NavBar, ErrorBoundary, web hover styles
  index.tsx            # Results grid, filters, search progress
  trip.tsx             # Shared trip config editor
  keeps.tsx            # Shortlist
  banned.tsx           # Ban list, active vs expired
  profile.tsx          # Account, stats, sign out
  admin.tsx            # Allowlist + source toggles
  listing/[id].tsx     # Detail: gallery, availability strip, keep/ban

components/
  Gate.tsx             # signed-out / pending / member gating
  ListingCard.tsx      # hero photo, stats, availability badge
  BanMenu.tsx          # scope x duration picker
  AvailabilityStrip.tsx SearchProgress.tsx ChipRow.tsx NavBar.tsx
  LazyImage.tsx ErrorBoundary.tsx

lib/                   # client-side: supabase client + types, hooks, geo, hover helper
constants/             # colors.ts (Smoky Mountain palette), cabins.ts (vocabulary)

api/                   # Vercel Functions (Node) — never bundled into the client
  search.ts            # fan-out entrypoint
  sources/[slug].ts    # runs one source, guarded by CRON_SECRET
  cron/warm.ts         # nightly refresh
  _lib/                # service-role db access, auth, shared run logic

scrapers/              # plain TS, no React
  types.ts             # SourceAdapter contract
  registry.ts          # adapter name -> implementation
  calendar.ts          # A/U/I/O decoding + stay logic  (+ calendar.test.ts)
  jsonld.ts            # schema.org extraction
  http.ts              # polite fetch: UA, robots.txt, per-host queue
  normalize.ts         # amenity/town/money normalization
  adapters/            # elk-springs, generic-jsonld, apify

scripts/probe-elk-springs.ts   # live smoke test against the real site
supabase-setup.sql             # full schema, RLS, seed data
```

## Adding a rental company

Don't hand-write the URL pattern — measure it:

```bash
npm run discover -- https://www.somecabins.com
```

That reads the site's sitemap, clusters URLs by path shape, fetches a sample page from each
cluster, and scores how much real listing data comes back. It then generates candidate
regexes, **fetches pages from each to check they're actually cabins**, and prints a
ready-to-paste config with a `READY` or `NEEDS REVIEW` verdict.

This exists because guessing is how a source ends up silently returning nothing, which is
indistinguishable from a site that has no cabins. Every enabled source's pattern came from
this tool.

Then dry-run the real adapter before enabling it:

```bash
npm run probe:generic -- https://www.somecabins.com '^/cabins/([a-z0-9-]+)/?$' 8
```

Most sites publish schema.org data, so adding one is usually a `companies` row rather than
code — `generic-jsonld` discovers listing pages from the sitemap and reads JSON-LD off each:

```sql
insert into companies (slug, name, base_url, adapter, adapter_kind, crawl_delay_ms, config)
values ('some-cabins', 'Some Cabins', 'https://www.somecabins.com',
        'generic-jsonld', 'jsonld', 1000,
        '{"listingUrl": "/cabins/([a-z0-9-]+)/?$"}'::jsonb);
```

`config.listingUrl` is a regex matched against sitemap URLs; capture group 1 becomes the
stable listing id. Confirm the pattern against their real sitemap before enabling the row —
the four disabled rows in `supabase-setup.sql` are ones whose patterns are still guesses.

A site with its own JSON API (like Elk Springs) gets a module in `scrapers/adapters/` and an
entry in `scrapers/registry.ts`.

## Setup

### 1. Supabase

1. Create a project, then run `supabase-setup.sql` in the SQL Editor.
2. **Authentication → Providers → Google**: enable it, paste in a Google OAuth client ID and
   secret, and add your Vercel URL (plus `http://localhost:8081`) to the redirect allowlist.
3. Add yourself, then uncomment and run the last two statements in `supabase-setup.sql` to
   put your email on the allowlist and make yourself admin. After that you can add everyone
   else from the Admin page.

### 2. Environment

`.env.local` for local dev (see `.env.example`):

```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

Server-only vars go in Vercel's project settings — **not** prefixed `EXPO_PUBLIC_`, so they
never reach the browser bundle:

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | same URL, server side |
| `SUPABASE_SERVICE_ROLE_KEY` | scraper writes; bypasses RLS, never expose |
| `CRON_SECRET` | guards `/api/cron/*` and the internal fan-out |
| `APIFY_TOKEN` | optional; without it Airbnb/Vrbo report `skipped` rather than failing |

### 3. Run it

```bash
npm install
npm run web          # http://localhost:8081
```

Note that `/api/*` only runs on Vercel (or `vercel dev`) — `npm run web` serves the SPA
alone, so the Search button needs a deployment or `vercel dev` to do anything.

## Verifying

```bash
npm test             # calendar decoding + stay logic, against a real captured calendar
npm run typecheck    # app (tsc) and Node side (tsconfig.node.json) separately
npm run probe:elk    # live: hits Elk Springs, asserts 100+ cabins and decodes real dates
npm run build        # expo export --platform web -> dist/
```

`npm run probe:elk` is the one that catches a site redesign. It prints the decoded trip
window per cabin, e.g. `AAO → booked` — that cabin is free the first two nights but the
third is a checkout day.

Things worth checking by hand after deploying:

- A Google account **not** on the allowlist lands in "pending" and sees no cabins.
- Ban a cabin at each of the three scopes and both durations; confirm it leaves the grid,
  and that a `season` ban from a previous year shows under "Expired" and stops filtering.
- Keep a cabin, run the warm cron, confirm it survives.
- `/api/*` isn't swallowed by the SPA rewrite in `vercel.json` (the negative lookahead
  starts with `api`), and the CSP allows the cabin photo CDNs.

## Bans and keeps

A ban is a **scope** × a **duration**:

- **Scope** — this listing, this cabin everywhere (once matched across sources), or the
  entire rental company.
- **Duration** — forever, or this season only. Bumping `season_year` on the Trip page
  retires every "this year only" ban at once.

All of it is enforced in one place: the `visible_listings` SQL view left-joins `bans` and
excludes anything matching, so no client query has to think about it. Bans are shared —
anyone can veto, anyone can lift a veto — and each records an optional reason so next year
you remember *why* you crossed something off.

**Keeps** are the opposite: a shared shortlist that ignores your filters and survives the
nightly prune, so a cabin you loved this year is still there next Labor Day.

## Scraping etiquette

`scrapers/http.ts` sends an identifying User-Agent, fetches and honors `robots.txt`
(including `Crawl-delay` — Cabins USA asks for 1s), and serializes requests per host through
a promise queue so concurrent callers can't stampede a site. Retries are bounded and backed
off, and non-429 4xx failures don't retry at all. This is six people checking a handful of
sites a few times a day, and it should behave like it.

## Known gaps

- **Track HS and Streamline adapters are stubs.** Their booking-engine endpoints aren't
  exposed on the public sites; the guessable paths 404. They fail with an explanation rather
  than returning nothing, so an unbuilt source never looks like an empty one.
- **Four generic-jsonld sources ship disabled** pending confirmation of their listing URL
  patterns against their real sitemaps.
- **Property matching across sources isn't implemented.** `listings.property_id` is always
  null, so the "ban this cabin everywhere" scope quietly falls back to banning just that
  listing (the ban dialog says so). Matching the same cabin on Airbnb and the company site
  is the natural next feature — it would let you book direct and skip the service fee.
- **Drive time is estimated**, not routed: straight-line distance from Knoxville with a
  1.35 detour factor at 42 mph. Good enough to exclude Asheville; not exact on mountain
  roads.
