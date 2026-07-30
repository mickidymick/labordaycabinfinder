-- ============================================================================
-- Enable the sources whose listing URL patterns have now been verified against
-- their live sitemaps with `npm run discover`.
--
-- Run this once in the Supabase SQL Editor. Safe to re-run.
-- ============================================================================

-- Hearthside — 159 listing URLs, 4/4 sampled pages verified as real cabins.
update companies set
  config  = '{"listingUrl": "^/cabins/([a-z0-9-]+)/?$",
              "excludeUrl": "/(booking|confirmation|by-name|by-area|search|specials|reservations|thank-you)/?$"}'::jsonb,
  enabled = true
where slug = 'hearthside';

-- Summit — 117 matched, 3/4 verified. The misses are booking-flow pages under
-- /cabins/, which excludeUrl drops before we spend a request on them.
update companies set
  config  = '{"listingUrl": "^/cabins/([a-z0-9-]+)/?$",
              "excludeUrl": "/(booking|confirmation|by-name|by-area|search|specials|reservations|thank-you)/?$"}'::jsonb,
  enabled = true
where slug = 'summit';

-- Timber Tops — 222 matched, 3/4 verified. Note the singular /cabin-rental/:
-- the plural /cabin-rentals/ is their category listing, not individual cabins.
update companies set
  config  = '{"listingUrl": "^/cabin-rental/([a-z0-9-]+)/?$",
              "excludeUrl": "/(booking|confirmation|by-name|by-area|search|specials|reservations|thank-you)/?$"}'::jsonb,
  enabled = true
where slug = 'timber-tops';

-- Cabins USA — pattern re-derived by the same tool and confirmed against 145
-- URLs. Anchored on the trailing id, which is stabler than the slug.
update companies set
  config  = '{"listingUrl": "-(\\d+)\\.php$"}'::jsonb
where slug = 'cabins-usa';

-- Volunteer Cabin Rentals — removed. The site sits behind a Cloudflare bot
-- challenge that returns 403 "Just a moment..." to any non-browser client.
-- That is an explicit request not to be crawled, so we honor it rather than
-- work around it.
delete from companies where slug = 'volunteer';

-- Check the result: 5 enabled sources.
select slug, name, enabled, supports_availability, config->>'listingUrl' as listing_pattern
from companies
order by enabled desc, slug;
