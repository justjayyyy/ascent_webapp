# Deploying

Ascent runs on Vercel: the web app is a static Vite build, and the whole API is one function
(`api/index.js` exporting the Express app). Settings live in `vercel.json`: rewrites, the page security
headers, the API function and the two summary-email crons.

## Every deploy

Pushing to `main` deploys to production; other branches get preview deployments. GitHub Actions runs
`npm run check` and a production `npm audit` on every push (`.github/workflows/check.yml`); merge only
when it is green.

## Project settings in Vercel

- Root directory: `ascent_webapp`
- Framework preset: Vite (build `npm run build`, output `dist`)
- Node.js: 22 or newer

## Environment variables

Set these for Production (and Preview if previews should work). The README has the full table.

| Variable | Why |
| --- | --- |
| `MONGODB_URI` | The database |
| `JWT_SECRET` | Signs sessions; the API refuses to sign without it in production |
| `FRONTEND_URL` | The app's address, used for every link in emails (`https://ascentwebapp.vercel.app` or your domain) |
| `CRON_SECRET` | Vercel sends it to the summary-email crons; without it they are refused |
| `VITE_GOOGLE_CLIENT_ID` | Google sign-in (the API accepts tokens issued for this client only) |
| `GOOGLE_CLIENT_SECRET` | The same OAuth client's secret: keeps Google Calendar connected across sign-ins. Without it the calendar connects for an hour at a time |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Invitations, password reset, email confirmation, summaries |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Push notifications |
| `ANTHROPIC_API_KEY` | The AI assistant (off until a workspace owner turns it on) |
| `SENTRY_DSN`, `VITE_SENTRY_DSN` | Error tracking: the DSN of a Sentry project, the same value in both |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | Optional: readable stack traces (source maps uploaded at build time) |

MongoDB Atlas must accept connections from Vercel (Network Access).

## After a deploy that changes indexes

Run the index script from the deployed commit against the production database:

```bash
node --env-file=.env server/scripts/ensure-indexes.mjs
```

If it reports duplicate categories, run it again with `--fix-duplicate-categories`.

## One-off data fixes

- `server/scripts/backfill-ingest-fields.mjs`: fills `created_by` on rows added before the server recorded
  it, and status/source on rows from before automation. Dry run by default; `--apply` writes.

## Checking a deploy

1. `https://<your app>/api/health` answers `{ "status": "ok" }`.
2. Sign in, add an expense, open each page.
3. Vercel → the project → Logs for any `[...] failed` lines from the API.
