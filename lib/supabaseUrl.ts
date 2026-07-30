/**
 * Supabase's API settings page shows the project URL and the "RESTful endpoint"
 * (`<project>.supabase.co/rest/v1`) next to each other, and it's easy to copy
 * the wrong one. supabase-js appends its own `/auth/v1/...` and `/rest/v1/...`
 * paths, so a URL with a path baked in produces requests to
 * `/rest/v1/auth/v1/authorize`, which the API gateway rejects with a confusing
 * "No API key found in request" — the key is being sent, the path is just wrong.
 *
 * Normalizing here means either value works.
 */
export function normalizeSupabaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    // Only the origin is ever meaningful; drop any path, query or hash.
    return url.origin;
  } catch {
    // Not parseable as a URL — hand it back untouched so createClient can
    // raise its own, clearer error.
    return trimmed.replace(/\/+$/, '');
  }
}
