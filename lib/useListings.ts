import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, type ListingWithMeta, type TripConfig } from './supabase';

export type SortKey = 'price_asc' | 'price_desc' | 'rating' | 'sleeps' | 'distance' | 'newest';

export type ListingFilters = {
  /** Narrow further than the shared trip config, just for this browser. */
  amenities: string[];
  towns: string[];
  minSleeps: number | null;
  maxNightly: number | null;
  /** Hide cabins we can't confirm are free. Off by default — most sources can't say. */
  onlyAvailable: boolean;
  onlyKept: boolean;
  sort: SortKey;
};

export const DEFAULT_FILTERS: ListingFilters = {
  amenities: [],
  towns: [],
  minSleeps: null,
  maxNightly: null,
  onlyAvailable: false,
  onlyKept: false,
  sort: 'rating',
};

/**
 * Reads `visible_listings`, which has already applied every ban (listing,
 * property and company scopes, forever and season durations) — so nothing here
 * has to reason about ban logic.
 */
export function useListings(config: TripConfig | null) {
  const [rows, setRows] = useState<ListingWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error } = await supabase
      .from('visible_listings')
      .select('*')
      .order('rating', { ascending: false, nullsFirst: false })
      .limit(1000);

    if (error) setError(error.message);
    else setRows((data ?? []) as ListingWithMeta[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    // New listings stream in while a search runs.
    const channel = supabase
      .channel('listings-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'listings' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  return { rows, loading, error, refresh: load };
}

/** Client-side filtering and sorting over the already-ban-filtered rows. */
export function useFilteredListings(
  rows: ListingWithMeta[],
  filters: ListingFilters,
  config: TripConfig | null,
) {
  return useMemo(() => {
    const required = new Set([...(config?.required_amenities ?? []), ...filters.amenities]);
    const towns = filters.towns.length
      ? new Set(filters.towns)
      : config?.towns?.length
        ? new Set(config.towns)
        : null;

    const minSleeps = filters.minSleeps ?? config?.guests ?? null;
    const maxNightly = filters.maxNightly ?? config?.max_nightly_rate ?? null;
    const minBedrooms = config?.min_bedrooms ?? null;
    const maxDrive = config?.max_drive_minutes ?? null;
    const minRating = config?.min_rating ?? null;

    const kept = rows.filter((r) => {
      if (filters.onlyKept && !r.is_kept) return false;
      // A cabin we can't confirm is still worth showing; only a hard `false` is
      // a real "it's booked".
      if (filters.onlyAvailable && r.available_for_trip !== true) return false;
      if (r.available_for_trip === false) return false;

      if (minBedrooms != null && (r.bedrooms ?? 0) < minBedrooms) return false;
      if (minSleeps != null && r.sleeps != null && r.sleeps < minSleeps) return false;
      if (maxNightly != null && r.nightly_rate_from != null && r.nightly_rate_from > maxNightly) {
        return false;
      }
      if (maxDrive != null && r.drive_minutes != null && r.drive_minutes > maxDrive) return false;
      if (minRating != null && r.rating != null && r.rating < minRating) return false;
      if (towns && r.town && !towns.has(r.town)) return false;

      if (required.size) {
        const have = new Set(r.amenities ?? []);
        for (const a of required) if (!have.has(a)) return false;
      }
      return true;
    });

    const bySort: Record<SortKey, (a: ListingWithMeta, b: ListingWithMeta) => number> = {
      price_asc: (a, b) => (a.nightly_rate_from ?? Infinity) - (b.nightly_rate_from ?? Infinity),
      price_desc: (a, b) => (b.nightly_rate_from ?? -1) - (a.nightly_rate_from ?? -1),
      rating: (a, b) => (b.rating ?? -1) - (a.rating ?? -1),
      sleeps: (a, b) => (b.sleeps ?? -1) - (a.sleeps ?? -1),
      distance: (a, b) => (a.drive_minutes ?? Infinity) - (b.drive_minutes ?? Infinity),
      newest: (a, b) => b.created_at.localeCompare(a.created_at),
    };

    // Kept cabins float to the top regardless of sort — they're the shortlist.
    return [...kept].sort(
      (a, b) => Number(b.is_kept) - Number(a.is_kept) || bySort[filters.sort](a, b),
    );
  }, [rows, filters, config]);
}
