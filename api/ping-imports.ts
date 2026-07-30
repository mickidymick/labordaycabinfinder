// Second half of the diagnostic: same as ping.ts but it imports the exact module
// graph /api/search.ts pulls in — including files outside api/ (scrapers/, lib/,
// constants/) and the .ts import extensions. If ping.ts works and this doesn't,
// the problem is module resolution/bundling, not the runtime.

import { HttpError } from './_lib/auth.ts';
import { windowFor } from './_lib/db.ts';
import { getAdapter } from '../scrapers/registry.ts';
import { isStayAvailable } from '../scrapers/calendar.ts';
import { resolveDriveMinutes } from '../lib/geo.ts';

export default function handler(req: any, res: any) {
  res.status(200).json({
    ok: true,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'unknown',
    checks: {
      httpError: new HttpError(418, 'teapot').status === 418,
      window: windowFor({ checkIn: '2026-09-04', checkOut: '2026-09-07', guests: 8 }),
      adapter: getAdapter('elk-springs').slug,
      stay: isStayAvailable(
        [
          { day: '2026-09-04', state: 'A' },
          { day: '2026-09-05', state: 'A' },
          { day: '2026-09-06', state: 'O' },
        ],
        '2026-09-04',
        '2026-09-07',
      ),
      drive: resolveDriveMinutes({ lat: 35.7143, lng: -83.5102 }, 'Gatlinburg'),
    },
  });
}
