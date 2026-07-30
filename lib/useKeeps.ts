import { useCallback, useEffect, useState } from 'react';
import { supabase, type Keep } from './supabase';

/**
 * "Keep" pins a cabin to the shortlist. It's shared rather than per-user — the
 * point is a list the group agrees on — and kept cabins survive the nightly
 * prune so a favorite from last year is still there next Labor Day.
 */
export function useKeeps() {
  const [keeps, setKeeps] = useState<Keep[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('keeps')
      .select('*')
      .order('created_at', { ascending: false });
    setKeeps((data ?? []) as Keep[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('keeps-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'keeps' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const toggleKeep = useCallback(
    async (listingId: string, isKept: boolean, note?: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { error: 'Not signed in' };

      // Optimistic: the grid re-sorts immediately, then Realtime confirms.
      if (isKept) {
        setKeeps((k) => k.filter((x) => x.listing_id !== listingId));
        const { error } = await supabase.from('keeps').delete().eq('listing_id', listingId);
        if (error) await load();
        return { error: error?.message ?? null };
      }

      const { error } = await supabase.from('keeps').insert({
        listing_id: listingId,
        note: note ?? null,
        created_by: user.id,
      });
      if (error) return { error: error.message };
      await load();
      return { error: null };
    },
    [load],
  );

  return { keeps, loading, toggleKeep, refresh: load };
}
