import { useCallback, useEffect, useState } from 'react';
import { supabase, type Ban, type BanDuration, type BanScope, type ListingWithMeta } from './supabase';

export type BanRequest = {
  scope: BanScope;
  duration: BanDuration;
  reason?: string | null;
  note?: string | null;
};

/**
 * Bans are shared: anyone can veto, anyone can lift. Six friends arguing about
 * a cabin is the point, so there's no per-user ownership here beyond recording
 * who did it.
 */
export function useBans(seasonYear: number | null) {
  const [bans, setBans] = useState<Ban[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('bans')
      .select('*')
      .order('created_at', { ascending: false });
    setBans((data ?? []) as Ban[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('bans-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bans' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  /** Resolve which id a scope targets and record a readable label alongside it. */
  const ban = useCallback(
    async (listing: ListingWithMeta, req: BanRequest) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { error: 'Not signed in' };

      const target =
        req.scope === 'listing'
          ? { id: listing.id, label: listing.name }
          : req.scope === 'company'
            ? { id: listing.company_id, label: listing.company_name }
            // Property scope needs a property to point at. Listings only get one
            // once they've been matched across sources, so fall back to banning
            // just this listing rather than silently doing nothing.
            : listing.property_id
              ? { id: listing.property_id, label: listing.name }
              : null;

      const scope: BanScope = target ? req.scope : 'listing';
      const resolved = target ?? { id: listing.id, label: listing.name };

      const { error } = await supabase.from('bans').insert({
        scope,
        target_id: resolved.id,
        duration: req.duration,
        season_year: req.duration === 'season' ? seasonYear : null,
        reason: req.reason ?? null,
        note: req.note ?? null,
        target_label: resolved.label,
        created_by: user.id,
      });

      if (error) return { error: error.message };
      await load();
      return {
        error: null,
        // Tell the caller when we downgraded the scope, so the UI can say so.
        downgraded: scope !== req.scope,
      };
    },
    [seasonYear, load],
  );

  const unban = useCallback(async (banId: string) => {
    const { error } = await supabase.from('bans').delete().eq('id', banId);
    if (!error) await load();
    return { error: error?.message ?? null };
  }, [load]);

  return { bans, loading, ban, unban, refresh: load };
}
