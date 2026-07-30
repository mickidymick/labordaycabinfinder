// POST /api/sources/<slug>?run=<runId> — runs a single source.
//
// Internal: called by /api/search's fan-out and guarded by CRON_SECRET, so it
// can't be used to point our scrapers at arbitrary sites. Each source gets its
// own invocation and therefore its own time budget.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { HttpError, requireSecret, sendError } from '../_lib/auth.ts';
import { finishRunIfDone, getCompanies, getTripConfig, markSource } from '../_lib/db.ts';
import { runSource, SourceSkipped } from '../_lib/runSource.ts';

/** Leave headroom inside the 60s function limit to write results and finish up. */
const WORK_BUDGET_MS = 50_000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const startedAt = Date.now();
  let runId: string | undefined;
  let companyId: string | undefined;

  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Use POST');
    requireSecret(req);

    const slug = String(req.query.slug ?? '');
    runId = req.query.run ? String(req.query.run) : undefined;
    if (!slug) throw new HttpError(400, 'Missing source slug');

    const [company] = await getCompanies({ onlyEnabled: false, slugs: [slug] });
    if (!company) throw new HttpError(404, `Unknown source "${slug}"`);
    companyId = company.id;

    const trip = await getTripConfig();
    const result = await runSource({
      company,
      trip,
      deadline: startedAt + WORK_BUDGET_MS,
      runId,
    });

    if (runId) {
      await markSource(runId, company.id, {
        status: 'done',
        found_count: result.found,
        available_count: result.available,
        finished_at: new Date().toISOString(),
      });
      await finishRunIfDone(runId);
    }

    res.status(200).json({ slug, ...result, elapsedMs: Date.now() - startedAt });
  } catch (e) {
    // Record the failure against the run so a broken source is visible in the
    // UI rather than looking like a source that simply found nothing.
    if (runId && companyId) {
      const skipped = e instanceof SourceSkipped;
      await markSource(runId, companyId, {
        status: skipped ? 'skipped' : 'error',
        error: e instanceof Error ? e.message.slice(0, 500) : 'Unexpected error',
        finished_at: new Date().toISOString(),
      });
      await finishRunIfDone(runId);
    }
    sendError(res, e);
  }
}
