// POST /api/search — kicks off an on-demand search.
//
// Creates the run rows, then fans out one invocation per source. It deliberately
// does NOT wait for the sources to finish: each is its own function invocation
// with its own 60s budget, and results reach the browser over Supabase Realtime
// as they land. So the button responds immediately and the grid fills in.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { HttpError, requireMember, selfBaseUrl, sendError } from './_lib/auth';
import { db, getCompanies, getTripConfig } from './_lib/db';

/**
 * How long to give the fan-out requests to be accepted before returning. Once
 * Vercel has received a child request it runs to completion independently of
 * this invocation, so we only need to cover the handoff, not the work.
 */
const HANDOFF_GRACE_MS = 3000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Use POST');
    const { userId } = await requireMember(req);

    const trip = await getTripConfig();
    const companies = await getCompanies({ onlyEnabled: true });
    if (companies.length === 0) {
      throw new HttpError(409, 'No sources are enabled — turn some on in Admin');
    }

    // Apify-backed sources cost money and need a token; skip rather than fail.
    const hasApifyToken = Boolean(process.env.APIFY_TOKEN);
    const runnable = companies.filter(
      (c) => c.adapter_kind !== 'apify' || hasApifyToken,
    );

    const { data: run, error: runError } = await db()
      .from('search_runs')
      .insert({ started_by: userId, season_year: trip.seasonYear, status: 'running' })
      .select('id')
      .single();
    if (runError || !run) throw new HttpError(500, `Could not start run: ${runError?.message}`);

    await db().from('search_run_sources').insert(
      companies.map((c) => ({
        run_id: run.id,
        company_id: c.id,
        company_slug: c.slug,
        status: runnable.includes(c) ? 'pending' : 'skipped',
        error: runnable.includes(c) ? null : 'APIFY_TOKEN is not configured',
      })),
    );

    // Fan out. Each child verifies the shared secret, so this endpoint can't be
    // used to make us scrape arbitrary sites.
    const base = selfBaseUrl(req);
    const secret = process.env.CRON_SECRET ?? '';
    const handoffs = runnable.map((c) =>
      fetch(`${base}/api/sources/${encodeURIComponent(c.slug)}?run=${run.id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}` },
      }).catch((e) => {
        console.error(`Handoff to ${c.slug} failed:`, e);
      }),
    );

    await Promise.race([
      Promise.allSettled(handoffs),
      new Promise((r) => setTimeout(r, HANDOFF_GRACE_MS)),
    ]);

    res.status(202).json({
      runId: run.id,
      sources: runnable.map((c) => c.slug),
      skipped: companies.filter((c) => !runnable.includes(c)).map((c) => c.slug),
    });
  } catch (e) {
    sendError(res, e);
  }
}
