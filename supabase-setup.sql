-- ============================================================================
-- Labor Day Cabin Finder — full schema
-- Paste into the Supabase SQL Editor and run once. Safe to re-run.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ─── Enums ──────────────────────────────────────────────────────────────────

do $$ begin
  create type user_role   as enum ('pending', 'member', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type adapter_kind as enum ('api', 'jsonld', 'apify');
exception when duplicate_object then null; end $$;

do $$ begin
  create type day_state   as enum ('A', 'U', 'I', 'O');  -- Available/Unavailable/checkIn/checkOut
exception when duplicate_object then null; end $$;

do $$ begin
  create type ban_scope    as enum ('listing', 'property', 'company');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ban_duration as enum ('forever', 'season');
exception when duplicate_object then null; end $$;

do $$ begin
  create type run_status   as enum ('pending', 'running', 'done', 'error', 'skipped');
exception when duplicate_object then null; end $$;


-- ─── Access control ─────────────────────────────────────────────────────────

-- The allowlist. Google sign-in succeeds for anyone, but only emails listed here
-- get the `member` role; everyone else lands in `pending` and RLS shows them nothing.
create table if not exists allowed_emails (
  email       text primary key,
  note        text,
  added_by    uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  avatar_url  text,
  role        user_role not null default 'pending',
  created_at  timestamptz not null default now()
);

-- Role lookups used inside RLS policies must be SECURITY DEFINER, otherwise a
-- policy on `profiles` that reads `profiles` recurses infinitely.
create or replace function public.my_role()
returns user_role
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.is_member()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.my_role() in ('member', 'admin'), false) $$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.my_role() = 'admin', false) $$;

grant execute on function public.my_role, public.is_member, public.is_admin to authenticated;

-- Auto-provision a profile on signup, granting `member` only to allowlisted emails.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_email text := lower(coalesce(new.email, ''));
  v_role  user_role := 'pending';
begin
  if exists (select 1 from public.allowed_emails ae where lower(ae.email) = v_email) then
    v_role := 'member';
  end if;

  insert into public.profiles (id, email, full_name, avatar_url, role)
  values (
    new.id,
    v_email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    new.raw_user_meta_data->>'avatar_url',
    v_role
  )
  on conflict (id) do update
    set email      = excluded.email,
        full_name  = coalesce(nullif(excluded.full_name, ''), profiles.full_name),
        avatar_url = coalesce(excluded.avatar_url, profiles.avatar_url);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Adding someone to the allowlist promotes them immediately, even if they already
-- signed in and got parked in `pending`.
create or replace function public.promote_on_allowlist()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update public.profiles
     set role = 'member'
   where lower(email) = lower(new.email) and role = 'pending';
  return new;
end;
$$;

drop trigger if exists on_allowed_email_added on allowed_emails;
create trigger on_allowed_email_added
  after insert on allowed_emails
  for each row execute function public.promote_on_allowlist();


-- ─── Sources ────────────────────────────────────────────────────────────────

create table if not exists companies (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text unique not null,
  name                  text not null,
  base_url              text not null,
  adapter               text not null,             -- registry key in scrapers/registry.ts
  adapter_kind          adapter_kind not null default 'jsonld',
  config                jsonb not null default '{}'::jsonb,
  enabled               boolean not null default true,
  supports_availability boolean not null default false,
  crawl_delay_ms        integer not null default 1000,
  last_warmed_at        timestamptz,
  created_at            timestamptz not null default now()
);

-- A physical cabin, independent of which site is advertising it. Nullable on
-- listings: we only populate it once two sources are confidently matched.
create table if not exists properties (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  town        text,
  lat         double precision,
  lng         double precision,
  created_at  timestamptz not null default now()
);

create table if not exists listings (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references companies(id) on delete cascade,
  property_id        uuid references properties(id) on delete set null,
  source_listing_id  text not null,
  name               text not null,
  url                text not null,
  hero_image_url     text,
  image_urls         jsonb not null default '[]'::jsonb,
  description        text,
  town               text,
  lat                double precision,
  lng                double precision,
  drive_minutes      integer,
  bedrooms           integer,
  bathrooms          numeric(4,1),
  sleeps             integer,
  amenities          jsonb not null default '[]'::jsonb,
  nightly_rate_from  numeric(10,2),
  rating             numeric(3,2),
  review_count       integer,
  last_seen_at       timestamptz not null default now(),
  verified_at        timestamptz,
  created_at         timestamptz not null default now(),
  unique (company_id, source_listing_id)
);

create index if not exists listings_company_idx  on listings (company_id);
create index if not exists listings_property_idx on listings (property_id);
create index if not exists listings_filter_idx   on listings (sleeps, bedrooms, nightly_rate_from);
create index if not exists listings_amenities_idx on listings using gin (amenities);

create table if not exists availability (
  listing_id   uuid not null references listings(id) on delete cascade,
  day          date not null,
  state        day_state not null,
  nightly_rate numeric(10,2),
  updated_at   timestamptz not null default now(),
  primary key (listing_id, day)
);

create index if not exists availability_day_idx on availability (day) where state <> 'U';


-- ─── Trip config (single shared row) ────────────────────────────────────────

create table if not exists trip_config (
  id                 integer primary key default 1 check (id = 1),
  season_year        integer not null default extract(year from now())::int,
  check_in           date not null,
  check_out          date not null,
  guests             integer not null default 8,
  min_bedrooms       integer,
  max_nightly_rate   numeric(10,2),
  max_total          numeric(10,2),
  required_amenities jsonb not null default '[]'::jsonb,
  towns              jsonb not null default '[]'::jsonb,
  max_drive_minutes  integer default 90,
  min_rating         numeric(3,2),
  updated_by         uuid references auth.users(id) on delete set null,
  updated_at         timestamptz not null default now(),
  check (check_out > check_in)
);

-- Seed with Labor Day weekend 2026 (Fri Sep 4 → Mon Sep 7; Labor Day is Sep 7).
insert into trip_config (id, season_year, check_in, check_out, guests, min_bedrooms, max_drive_minutes)
values (1, 2026, '2026-09-04', '2026-09-07', 8, 3, 90)
on conflict (id) do nothing;


-- ─── Bans and keeps ─────────────────────────────────────────────────────────

create table if not exists bans (
  id           uuid primary key default gen_random_uuid(),
  scope        ban_scope not null,
  target_id    uuid not null,          -- listing.id | property.id | company.id, per scope
  duration     ban_duration not null default 'season',
  season_year  integer,                -- required when duration = 'season'
  reason       text,
  note         text,
  target_label text,                   -- denormalized name so the ban list needs no joins
  created_by   uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  check (duration = 'forever' or season_year is not null)
);

-- One ban per target per scope per season. A 'forever' ban uses season_year = 0
-- so the unique index has something to key on.
create unique index if not exists bans_unique_idx
  on bans (scope, target_id, duration, coalesce(season_year, 0));

create index if not exists bans_lookup_idx on bans (scope, target_id);

create table if not exists keeps (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references listings(id) on delete cascade,
  note        text,
  created_by  uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (listing_id)
);


-- ─── Search runs (drives the live progress UI over Realtime) ────────────────

create table if not exists search_runs (
  id           uuid primary key default gen_random_uuid(),
  started_by   uuid not null references auth.users(id) on delete cascade,
  season_year  integer not null,
  status       run_status not null default 'pending',
  created_at   timestamptz not null default now(),
  finished_at  timestamptz
);

create table if not exists search_run_sources (
  id              uuid primary key default gen_random_uuid(),
  run_id          uuid not null references search_runs(id) on delete cascade,
  company_id      uuid not null references companies(id) on delete cascade,
  company_slug    text not null,
  status          run_status not null default 'pending',
  found_count     integer not null default 0,
  available_count integer not null default 0,
  error           text,
  started_at      timestamptz,
  finished_at     timestamptz,
  unique (run_id, company_id)
);

create index if not exists search_run_sources_run_idx on search_run_sources (run_id);


-- ─── Availability helpers ───────────────────────────────────────────────────

-- Returns true/false if we have full calendar coverage for the stay, NULL if we
-- don't know. NULL is meaningfully different from false — the UI shows "unknown,
-- check their site" rather than hiding the cabin.
--
-- Nights are [check_in, check_out); the checkout day is not a night. A night is
-- bookable only in state 'A' or 'I'. 'O' is the departure day of an existing
-- booking — the guest leaves that morning, so you cannot sleep there. Counting
-- 'O' as available would report booked cabins as free. Mirrors BOOKABLE_NIGHT
-- in scrapers/calendar.ts; change both together.
create or replace function public.listing_available(p_listing uuid, p_in date, p_out date)
returns boolean
language sql stable
as $$
  select case
    when p_out <= p_in then null
    when (
      select count(*) from availability a
       where a.listing_id = p_listing and a.day >= p_in and a.day < p_out
    ) < (p_out - p_in) then null
    else not exists (
      select 1 from availability a
       where a.listing_id = p_listing and a.day >= p_in and a.day < p_out
         and a.state not in ('A', 'I')
    )
  end;
$$;

-- Total for the stay, only when every night has a rate. Nights are [check_in, check_out).
create or replace function public.listing_trip_total(p_listing uuid, p_in date, p_out date)
returns numeric
language sql stable
as $$
  select case
    when count(*) filter (where a.nightly_rate is not null) = (p_out - p_in)
      then sum(a.nightly_rate)
    else null
  end
  from availability a
  where a.listing_id = p_listing and a.day >= p_in and a.day < p_out;
$$;

grant execute on function public.listing_available, public.listing_trip_total to authenticated;


-- ─── The one view the UI reads ──────────────────────────────────────────────
-- Applies ban logic (all three scopes × both durations) so no client query ever
-- has to reason about it. security_invoker keeps the caller's RLS in force.

create or replace view visible_listings with (security_invoker = on) as
select
  l.*,
  c.slug as company_slug,
  c.name as company_name,
  c.supports_availability,
  (k.listing_id is not null) as is_kept,
  k.note as keep_note,
  public.listing_available(l.id, t.check_in, t.check_out)  as available_for_trip,
  public.listing_trip_total(l.id, t.check_in, t.check_out) as trip_total
from listings l
join companies c  on c.id = l.company_id
cross join trip_config t
left join keeps k on k.listing_id = l.id
where t.id = 1
  and c.enabled
  and not exists (
    select 1 from bans b
     where (b.duration = 'forever'
            or (b.duration = 'season' and b.season_year = t.season_year))
       and (
         (b.scope = 'listing'  and b.target_id = l.id)
         or (b.scope = 'property' and l.property_id is not null and b.target_id = l.property_id)
         or (b.scope = 'company'  and b.target_id = l.company_id)
       )
  );


-- ─── Row-level security ─────────────────────────────────────────────────────

alter table allowed_emails     enable row level security;
alter table profiles           enable row level security;
alter table companies          enable row level security;
alter table properties         enable row level security;
alter table listings           enable row level security;
alter table availability       enable row level security;
alter table trip_config        enable row level security;
alter table bans               enable row level security;
alter table keeps              enable row level security;
alter table search_runs        enable row level security;
alter table search_run_sources enable row level security;

-- Everything readable by members; the service-role key used by /api bypasses RLS.
do $$
declare t text;
begin
  foreach t in array array[
    'companies','properties','listings','availability','trip_config',
    'bans','keeps','search_runs','search_run_sources'
  ] loop
    execute format('drop policy if exists "members read" on %I', t);
    execute format(
      'create policy "members read" on %I for select using (public.is_member())', t);
  end loop;
end $$;

-- Profiles: everyone sees the roster (it's six people), only admins change roles.
drop policy if exists "read profiles"   on profiles;
drop policy if exists "self update"     on profiles;
drop policy if exists "admin update"    on profiles;
create policy "read profiles" on profiles for select using (public.is_member() or id = auth.uid());
create policy "self update"   on profiles for update using (id = auth.uid())
                                          with check (id = auth.uid() and role = public.my_role());
create policy "admin update"  on profiles for update using (public.is_admin());

-- Allowlist is admin-only in both directions.
drop policy if exists "admin allowlist" on allowed_emails;
create policy "admin allowlist" on allowed_emails for all
  using (public.is_admin()) with check (public.is_admin());

-- Members edit the shared trip config.
drop policy if exists "members write trip" on trip_config;
create policy "members write trip" on trip_config for update
  using (public.is_member()) with check (public.is_member());

-- Members ban and unban. Anyone can lift anyone's ban — it's a six-person group,
-- and arguing about a cabin is the point.
drop policy if exists "members insert bans" on bans;
drop policy if exists "members delete bans" on bans;
create policy "members insert bans" on bans for insert
  with check (public.is_member() and created_by = auth.uid());
create policy "members delete bans" on bans for delete using (public.is_member());

drop policy if exists "members insert keeps" on keeps;
drop policy if exists "members delete keeps" on keeps;
create policy "members insert keeps" on keeps for insert
  with check (public.is_member() and created_by = auth.uid());
create policy "members delete keeps" on keeps for delete using (public.is_member());

-- Members kick off searches; the API function (service role) updates progress.
drop policy if exists "members start runs" on search_runs;
create policy "members start runs" on search_runs for insert
  with check (public.is_member() and started_by = auth.uid());

-- Admins toggle sources on and off.
drop policy if exists "admin write companies" on companies;
create policy "admin write companies" on companies for update
  using (public.is_admin()) with check (public.is_admin());


-- ─── Realtime (drives live search progress + results streaming in) ──────────

do $$
declare t text;
begin
  foreach t in array array['listings','search_runs','search_run_sources'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;


-- ─── Seed the sources ───────────────────────────────────────────────────────
-- `adapter` maps to a key in scrapers/registry.ts.
--
-- `supports_availability` = true means the source gives real dated availability.
-- Only Elk Springs (per-cabin calendar bitmap) and the two Apify actors (dated
-- search) do. Every other company site publishes a catalog but no queryable
-- calendar, so their cards show "check dates on their site" rather than a
-- confident yes/no. Flip the flag when an availability path gets built.
--
-- `enabled = false` rows are sources whose adapter is still a stub — see
-- scrapers/registry.ts. They're seeded so they show up in the admin list.
--
-- config.listingUrl is a regex matched against sitemap URLs; capture group 1
-- becomes source_listing_id. The Cabins USA pattern is verified against their
-- live sitemap; the others are starting guesses and need confirming — until
-- then those rows stay disabled so they can't quietly return nothing.

insert into companies (slug, name, base_url, adapter, adapter_kind, supports_availability, enabled, crawl_delay_ms, config) values
  -- Verified end to end: 178 cabins, 730-day calendars, one request for the catalog.
  ('elk-springs', 'Elk Springs Resort', 'https://www.elkspringsresort.com',
   'elk-springs', 'api', true, true, 400, '{}'::jsonb),

  -- Verified: sitemap lists ~264 cabins at the pattern below, and each detail
  -- page carries an Accommodation node with bedrooms/occupancy/amenities.
  -- robots.txt requests Crawl-delay: 1, which crawl_delay_ms honors.
  ('cabins-usa', 'Cabins USA', 'https://www.cabinsusa.com',
   'generic-jsonld', 'jsonld', false, true, 1000,
   '{"listingUrl": "-cabin-rental-(\\d+)\\.php$"}'::jsonb),

  -- Sitemaps confirmed to exist; listing URL patterns still need confirming.
  ('hearthside', 'Hearthside Cabin Rentals', 'https://www.hearthsidecabinrentals.com',
   'generic-jsonld', 'jsonld', false, false, 1000,
   '{"listingUrl": "/cabin[s]?/([a-z0-9-]+)/?$"}'::jsonb),

  ('timber-tops', 'Timber Tops Cabin Rentals', 'https://www.yourcabin.com',
   'generic-jsonld', 'jsonld', false, false, 1000,
   '{"listingUrl": "/cabin[s]?/([a-z0-9-]+)/?$"}'::jsonb),

  ('summit', 'Summit Cabin Rentals', 'https://www.summitcabinrentals.com',
   'generic-jsonld', 'jsonld', false, false, 1000,
   '{"listingUrl": "/cabin[s]?/([a-z0-9-]+)/?$"}'::jsonb),

  ('volunteer', 'Volunteer Cabin Rentals', 'https://www.volunteercabinrentals.com',
   'generic-jsonld', 'jsonld', false, false, 1000,
   '{"listingUrl": "/cabin[s]?/([a-z0-9-]+)/?$"}'::jsonb),

  -- Adapter stubs: PMS-backed, endpoints not yet reverse-engineered.
  ('cabins-of-the-smokies', 'Cabins of the Smoky Mountains', 'https://www.cabinsofthesmokymountains.com',
   'trackhs', 'api', false, false, 1000, '{}'::jsonb),

  ('bear-tootin', 'Bear Tootin Cabin Rentals', 'https://www.beartootin.com',
   'streamline', 'api', false, false, 1000, '{}'::jsonb),

  -- Dated search, so results are genuinely bookable. Disabled until APIFY_TOKEN
  -- is set; /api/search also skips them automatically when the token is missing.
  ('airbnb', 'Airbnb', 'https://www.airbnb.com',
   'apify-airbnb', 'apify', true, false, 0,
   '{"actor": "tri_angle~airbnb-scraper", "maxItems": 60}'::jsonb),

  ('vrbo', 'Vrbo', 'https://www.vrbo.com',
   'apify-vrbo', 'apify', true, false, 0,
   '{"actor": "parseforge~vrbo-scraper", "maxItems": 60}'::jsonb)
on conflict (slug) do nothing;


-- ─── Bootstrap: make yourself admin ─────────────────────────────────────────
-- >>> Replace the email below, then run these two statements. <<<

-- insert into allowed_emails (email, note) values ('jmcmicha@vols.utk.edu', 'owner')
--   on conflict (email) do nothing;
-- update profiles set role = 'admin' where lower(email) = 'jmcmicha@vols.utk.edu';
