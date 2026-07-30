import type { VercelRequest } from '@vercel/node';
import { db } from './db';

/**
 * Resolve the caller from their Supabase access token and confirm they're a
 * member. The client sends the token it already holds; we verify it server-side
 * rather than trusting any user id in the body.
 */
export async function requireMember(req: VercelRequest): Promise<{ userId: string }> {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new HttpError(401, 'Missing Authorization header');

  const { data, error } = await db().auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Invalid or expired session');

  const { data: profile } = await db()
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .single();

  if (!profile || (profile.role !== 'member' && profile.role !== 'admin')) {
    throw new HttpError(403, 'Your account is not approved for this site yet');
  }
  return { userId: data.user.id };
}

/**
 * Guards the cron and the internal fan-out endpoint. Vercel Cron sends
 * `Authorization: Bearer $CRON_SECRET`; the fan-out sends the same header so
 * one shared secret covers both.
 */
export function requireSecret(req: VercelRequest): void {
  const expected = process.env.CRON_SECRET;
  if (!expected) throw new HttpError(500, 'CRON_SECRET is not configured');

  const header = req.headers.authorization ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (provided !== expected) throw new HttpError(401, 'Bad or missing secret');
}

/**
 * Note the explicit field + assignment rather than a `public status` parameter
 * property. Parameter properties are TypeScript-only syntax that needs a real
 * compile step; the Vercel Node runtime only strips types, so that form throws
 * at module load and the function 500s before any handler code runs.
 */
export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export function sendError(res: { status: (n: number) => any }, e: unknown): void {
  const status = e instanceof HttpError ? e.status : 500;
  const message = e instanceof Error ? e.message : 'Unexpected error';
  if (status >= 500) console.error(e);
  res.status(status).json({ error: message });
}

/** Absolute base URL for this deployment, used to invoke sibling functions. */
export function selfBaseUrl(req: VercelRequest): string {
  const host = req.headers['x-forwarded-host'] ?? req.headers.host;
  const proto = (req.headers['x-forwarded-proto'] as string) ?? 'https';
  return `${proto}://${host}`;
}
