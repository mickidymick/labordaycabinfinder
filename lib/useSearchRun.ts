import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, type SearchRunSource } from './supabase';

/**
 * Kicks off /api/search and follows its progress over Realtime. The endpoint
 * returns as soon as the fan-out is handed off, so everything after that — each
 * source finishing, results appearing — arrives as database changes.
 */
export function useSearchRun() {
  const [runId, setRunId] = useState<string | null>(null);
  const [sources, setSources] = useState<SearchRunSource[]>([]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runIdRef = useRef<string | null>(null);

  const loadSources = useCallback(async (id: string) => {
    const { data } = await supabase
      .from('search_run_sources')
      .select('*')
      .eq('run_id', id)
      .order('company_slug');
    setSources((data ?? []) as SearchRunSource[]);
  }, []);

  // Reattach to the most recent run so a refresh mid-search doesn't lose it.
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('search_runs')
        .select('id, status')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.id && data.status === 'running') {
        runIdRef.current = data.id;
        setRunId(data.id);
        loadSources(data.id);
      }
    })();
  }, [loadSources]);

  useEffect(() => {
    if (!runId) return;
    const channel = supabase
      .channel(`run-${runId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'search_run_sources', filter: `run_id=eq.${runId}` },
        () => loadSources(runId),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [runId, loadSources]);

  const start = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not signed in');

      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Search failed (HTTP ${res.status})`);

      runIdRef.current = body.runId;
      setRunId(body.runId);
      await loadSources(body.runId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setStarting(false);
    }
  }, [loadSources]);

  const isRunning =
    starting || sources.some((s) => s.status === 'pending' || s.status === 'running');

  return { runId, sources, start, starting, isRunning, error };
}
