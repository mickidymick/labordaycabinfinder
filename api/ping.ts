// Deployment diagnostic. No imports, no TypeScript beyond plain annotations, so
// it isolates "is the runtime working and is this commit live?" from "is one of
// my modules failing to load?". Safe to delete once things are green.

export default function handler(req: any, res: any) {
  res.status(200).json({
    ok: true,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'unknown',
    runtime: process.version,
    env: {
      SUPABASE_URL: Boolean(process.env.SUPABASE_URL),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      CRON_SECRET: Boolean(process.env.CRON_SECRET),
      APIFY_TOKEN: Boolean(process.env.APIFY_TOKEN),
    },
  });
}
