// GET /api/cron/warm — nightly catalog + calendar refresh (see vercel.json crons).
//
// The slow half of the two-tier design. Search stays fast because this has
// already pulled every catalog and topped up the calendars overnight; the
// on-demand path then only has to re-verify a handful of results.
//
// One source per invocation, kicked off the same way /api/search fans out, so
// no single function has to fit every company into 60 seconds.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireSecret, selfBaseUrl, sendError } from '../_lib/auth';
import { getCompanies } from '../_lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    requireSecret(req);

    const companies = await getCompanies({ onlyEnabled: true });

    // Apify actors bill per run and only mean anything against specific dates,
    // so they're driven by search and never warmed on a schedule.
    const warmable = companies.filter((c) => c.adapter_kind !== 'apify');

    const base = selfBaseUrl(req);
    const secret = process.env.CRON_SECRET ?? '';

    await Promise.race([
      Promise.allSettled(
        warmable.map((c) =>
          fetch(`${base}/api/sources/${encodeURIComponent(c.slug)}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${secret}` },
          }).catch((e) => console.error(`Warm handoff to ${c.slug} failed:`, e)),
        ),
      ),
      new Promise((r) => setTimeout(r, 5000)),
    ]);

    res.status(202).json({ warming: warmable.map((c) => c.slug) });
  } catch (e) {
    sendError(res, e);
  }
}
