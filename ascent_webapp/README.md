# Ascent

A household finance app: income and expenses with categories, budgets and cards, plans paid over time,
loans and commitments, Keep-style notes, and a dashboard that says what is safe to spend. English,
Hebrew (right to left) and Russian. Installable PWA that keeps working offline. See `../PRODUCT.md`.

## Stack

- **Web app**: React 18, Vite, Tailwind, Radix UI, TanStack Query (persisted to IndexedDB), motion
- **API**: one Express app (`server/server.js`), served on Vercel by `api/index.js`
- **Database**: MongoDB via Mongoose
- **Auth**: JWT sessions in an HttpOnly, SameSite=Strict cookie that page scripts cannot read (up to 10 devices at once, each can be signed out), Google Sign-In (ID tokens), passkeys (WebAuthn), password reset and
  email confirmation by emailed one-time links (only their hashes are stored)

## Getting started

Node 22+ and a MongoDB database.

```bash
npm install
cp .env.example .env   # then fill it in, see below
npm run dev:all        # web app on :5173 and API on :3002
```

### Environment

| Variable | Needed | What it is |
| --- | --- | --- |
| `MONGODB_URI` | yes | MongoDB connection string |
| `JWT_SECRET` | yes in production | Signs sessions. The API refuses to start signing without it in production |
| `JWT_EXPIRES_IN` | no | Session length, default `7d` |
| `VITE_GOOGLE_CLIENT_ID` (or `GOOGLE_CLIENT_ID`) | for Google sign-in | The OAuth client id; the API only accepts ID tokens issued for it |
| `FRONTEND_URL` | yes in production | The app's address: links in every email (invitations, password reset, email confirmation, summaries) and an allowed browser origin. In production emailed links never follow the request's Origin |
| `PASSKEY_ORIGIN` | no | Another origin allowed to use passkeys |
| `CRON_SECRET` | yes in production | Vercel Cron sends it to the summary-email routes |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | for email | Invitations, password reset, email confirmation and summary emails. `SMTP_ALLOW_SELF_SIGNED=true` only for a private relay |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | for push | Web Push |
| `ANTHROPIC_API_KEY` | for the AI assistant | Off until a workspace owner turns it on |
| `SENTRY_DSN`, `VITE_SENTRY_DSN` | for error tracking | The Sentry project's DSN (the same value in both): the API and the app report errors. Off when unset |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | no | At build time: uploads source maps to Sentry for readable stack traces (they are not served) |
| `API_PROXY_TARGET` | no | Where `npm run dev` proxies `/api` (default `http://localhost:3002`) |

Deploying, environment and post-deploy steps: [DEPLOY.md](DEPLOY.md). After the first deploy, and whenever indexes change:

```bash
npm run ensure:indexes
```

## Checks

```bash
npm run lint       # ESLint over the server, shared code and the whole web app
npm test           # node --test (API, shared) and Vitest (web app)
npm run build
npm run check      # all three
```

- `npm run test:node`: API handlers against in-memory stand-ins for the models, and the shared logic.
- `npm run test:web`: Vitest + Testing Library in jsdom: API client, auth, data hooks, the offline queue,
  translations (every key in en/he/ru, every key the app uses exists), components and helpers, and
  `src/test/pages.test.jsx`, which renders every main screen in every language against an in-memory API
  (`src/test/fakeApi.js`).
- `npm run test:e2e`: Playwright in Chromium (`e2e/`). The production build, service worker included, against
  the real API on a throwaway in-memory MongoDB (`e2e/serve-api.mjs`; no real database or email is touched):
  signing up, out and in with the session cookie, passkeys with a virtual authenticator, an expense added
  offline reaching the server, and every main screen at iPhone size. The first run downloads Chromium
  (`npx playwright install chromium`) and MongoDB once. Not part of `npm run check`.

GitHub Actions (`.github/workflows/check.yml`) runs `npm run check` and a production `npm audit` on every push,
and the browser tests as a separate job (a failed run uploads the report and traces).

## Layout

```
api/index.js            Vercel entry: exports the Express app
server/
  server.js             routes, CORS, body limits, rate limit
  auth/                 register, login, Google, passkeys, /me
  api/                  workspaces, invitations, ingest (Apple Pay / SMS), statement import, assist, push, cron emails
  entities/             CRUD per collection (most use lib/entityHandler.js; notes and categories are custom)
  integrations/         Google Calendar proxy, stock quotes, legacy Apple Pay key
  lib/                  shared server code (entity handler, auth helpers, email, summaries, ingest parsing...)
  models/               Mongoose schemas
  scripts/              maintenance (seed data, demo account, indexes, backfills)
shared/                 pure logic used by both sides: money, forecast, commitments, subscriptions, balances, roles
src/
  api/client.js         the only way the app talks to the API
  hooks/useWorkspaceData.js   every shared list, cached per workspace; exchange rates and conversion
  lib/                  auth context, session, offline queue and cache, translations, helpers
  components/, pages/   UI
```

Conventions worth knowing:

- Every request carries the workspace in `x-workspace-id`; the server scopes every query to it.
- Lists are cached under `[name, workspaceId]` (see `useWorkspaceData.js`); invalidate with `['name']`.
- Transactions are written through the offline queue (`src/lib/offline/txOutbox.js`), never directly.
- Transactions are read by view, never all at once: `useTransactions({ from })` is a date window (14 months
  by default, longer when someone browses back) and `useLinkedTransactions(field)` gets every row with that
  field set (`planId`, `commitmentId`, `installmentGroupId`, `split`). The API supports `from`, `to` and `has`.
- Plan items and loan payments change one entry at a time (`changeEntry`, `PATCH ?list=`), never by rewriting the
  list, so two people editing at once keep both changes (`src/lib/listEntries.js`).
- The server sets who added a row (`created_by`); `paidBy`, split shares and settle-up people must be members.
- Deleting an account (`server/lib/deleteAccount.js`) deletes the workspaces only that person used. A shared one stays
  with `ownerLeft` set, and each remaining member is asked whether to keep it (`claim`) or leave it (`release`); the
  first to keep it becomes the owner, and when the last member leaves it is deleted with its data.
- CSV export (`src/lib/exportData.js`) fetches everything on demand and neutralises spreadsheet formulas.
- Money in another currency: `shared/money.js` (`amountInCurrency`, `conversionFields`).
- Every UI string lives in `src/lib/i18n/{en,he,ru}.js`, one file per language (a test checks all three have every key). A device downloads only the language it uses.
- Animations import from `@/lib/motion`, not `motion/react`: its `motion` is the lightweight `m`, whose animation code loads after start-up.
- Portfolio pages are hidden (`src/lib/features.js`) but kept; they are not linted for translations.
