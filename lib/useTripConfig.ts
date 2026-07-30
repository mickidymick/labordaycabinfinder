import { useCallback, useEffect, useState } from 'react';
import { supabase, type TripConfig } from './supabase';

/** The single shared trip config — one row, edited by whoever gets there first. */
export function useTripConfig() {
  const [config, setConfig] = useState<TripConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('trip_config').select('*').eq('id', 1).single();
    if (error) setError(error.message);
    else setConfig(data as TripConfig);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    // Everyone edits the same row, so pick up each other's changes live.
    const channel = supabase
      .channel('trip_config')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'trip_config' },
        (payload) => setConfig(payload.new as TripConfig),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const save = useCallback(async (patch: Partial<TripConfig>) => {
    setSaving(true);
    setError(null);
    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('trip_config')
      .update({ ...patch, updated_by: user?.id ?? null, updated_at: new Date().toISOString() })
      .eq('id', 1)
      .select()
      .single();

    if (error) setError(error.message);
    else setConfig(data as TripConfig);
    setSaving(false);
    return !error;
  }, []);

  return { config, loading, saving, error, save, refresh: load };
}

/** Nights in the configured stay. */
export function nightCount(config: TripConfig | null): number {
  if (!config) return 0;
  const ms = new Date(config.check_out).getTime() - new Date(config.check_in).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

export function formatDateRange(config: TripConfig | null): string {
  if (!config) return '';
  const fmt = (d: string) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  return `${fmt(config.check_in)} – ${fmt(config.check_out)}, ${config.season_year}`;
}
