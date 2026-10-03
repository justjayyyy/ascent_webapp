# Ascent — E2E Testing Vision & Master Test Plan

> Scope: the Ascent PWA (`ascent_webapp/`): React 18 + Vite + Radix UI on the client, one Express API
> (`server/server.js`) on Vercel, MongoDB through Mongoose, JWT sessions in an HttpOnly cookie, a service
> worker with offline writes, and English / Hebrew (RTL) / Russian.
>
> Written against the code as of commit `0fdca95` (2 Oct 2026). Every route, label, limit and status code here
> was taken from the source; where the plan proposes something new it says so.

---

## 0. Executive summary

### 0.1 What already exists (and is good)

| Layer | Where | Covers |
| --- | --- | --- |
| API unit/handler tests | `server/**/*.test.mjs` (`node --test`) | Handlers against in-memory models, auth, sessions, ingest parsing, invitations, limits, security |
| Shared logic | `shared/**/*.test.mjs` | Money, forecast, commitments, roles/permissions |
| Component/page tests | `src/**/*.test.*`, `src/test/pages.test.jsx` (Vitest + jsdom) | Every main screen rendered in every language against `src/test/fakeApi.js`; translation key parity; axe in jsdom (`a11y.test.jsx`) |
| **E2E** | `e2e/*.spec.js` (Playwright) | 5 specs / ~10 tests: sign-up/out/in + cookie flags, wrong password, passkey add + sign-in, Face ID lock, offline expense + offline plan, phone layout overflow, phone menu |
| CI | `.github/workflows/check.yml` | `npm run check` + `npm audit`, then E2E in Chromium on a throwaway MongoDB |

The E2E harness is already built the right way: **the production build (service worker included) against
the real API on a disposable in-memory MongoDB**, role/label selectors, a virtual WebAuthn authenticator.
This plan keeps that architecture and scales it from ~10 tests to full coverage.

### 0.2 Gaps found while mapping the code (fix before scaling the suite)

| # | Gap | Why it matters | Fix (§) |
| --- | --- | --- | --- |
| G1 | Every test account is created through `POST /api/auth/register` from `localhost` | `limitAuth` caps sign-ups at **40 per 10 min per IP** (MongoDB counter) and **50 auth calls per 5 min** (memory). A suite past ~40 tests starts failing with 429 | Seed accounts straight into the DB and mint the session with the server's own `createAccount` + `issueSession`; partition rate-limit counters per worker with `X-Forwarded-For` (§1.4.3) |
| G2 | The suite reaches the public internet | Both the app (`useWorkspaceData.js`) and the API (`server/lib/rates.js`) fetch `api.exchangerate-api.com`; Google GSI is loaded from `accounts.google.com` | Stub every third party (§1.3.3) — hermetic runs, no flakes from someone else's outage |
| G3 | No way to read emails | `serve-api.mjs` strips `SMTP_*`, so invitations, password reset, email confirmation and summaries can't be tested end to end | In-process SMTP sink with a read endpoint (§1.3.4) |
| G4 | `workers: 1`, `fullyParallel: false` | Fine for 10 tests, ~40 min for 300 | Per-test isolation makes parallel safe; shard in CI (§5.3) |
| G5 | Each CI shard would run `vite build` again (inside `webServer`) | Minutes wasted per shard | Build once, upload `dist/`, shards only run `vite preview` (§5.2) |
| G6 | Chromium only | Most users are on **iPhones** (Safari/WebKit) | WebKit project on `main` + nightly; real-device pass for the installed PWA (§4.2) |
| G7 | Phone layout spec skips 4 screens | `PAGES` in `phone.spec.js` omits **Review, Savings, Groceries, Tasks** | Add them (§4.1) |
| G8 | HTML report uploaded only on failure; no trace on retry | Flaky passes are invisible | Always publish a merged report, `trace: 'on-first-retry'`, flaky-test tracking (§5.5–5.6) |
| G9 | No contrast / real-render a11y | jsdom axe skips colour contrast by design | `@axe-core/playwright` in the browser on every key state, all themes (§4.3) |

### 0.2.1 Phase 0 status (3 Oct 2026)

| Gap | Status | What was built |
| --- | --- | --- |
| G1 | ✅ | `e2e/harness/control.mjs`: a control server inside the e2e API process seeds accounts with the server's own `createAccount` + `issueSession` (`POST /seed/user`, `/seed/member`, `/seed/session`). Each test also gets its own client address (`X-Forwarded-For`, hashed from the test id), so rate-limit counters never carry over |
| G2 | ✅ | Browser: `e2e/support/network.js` stubs exchange rates and Google Identity Services (a fake script), refuses everything else, and the test fails on any refused request. API: `e2e/harness/outbound.mjs` replaces `fetch` for third parties; scenarios are **per test** (the `x-e2e-test` header is carried through an AsyncLocalStorage context), so parallel tests can stub differently |
| G3 | ✅ | `e2e/harness/mailSink.mjs` (SMTP on 127.0.0.1); `mail.waitFor(to)`, `mail.link(to, '/reset-password/')` |
| G4 | ✅ | `fullyParallel`, 50% of cores locally, 3 workers per CI machine |
| G5 | ✅ | `e2e/build-app.mjs` is the one test build (pins `VITE_GOOGLE_CLIENT_ID` and an empty Sentry DSN, so a developer's `.env` cannot make local differ from CI); CI builds once and shards run with `E2E_PREBUILT=1` |
| G6 | ⏳ Phase 2 | WebKit / Firefox projects |
| G7 | ✅ | All 11 app pages, one test each, with a real "page ready" check instead of `networkidle` |
| G8 | ✅ | Blob reports from 2 shards merged into one HTML report kept for every run; flaky tests listed in the job summary; traces on first retry, video on failure; PRs run new/changed specs 5× with no retries |
| G9 | ⏳ Phase 2 | axe in the browser |

Deviations from the original sketch, and why:
- **Seeding goes through the control server, not a Mongo connection from the test workers.** The API process already holds the connection and the models; no Mongoose in Playwright workers, no URI file to share.
- **No replica set.** Nothing in the server uses transactions; the standalone in-memory server starts faster.
- **Ports derive from one knob**: control = `E2E_API_PORT + 1`, mail = `+ 2`, so a second copy of the suite runs beside dev servers holding the defaults.
- **The PR gate runs the whole suite for now** (it takes about a minute); `--grep "@smoke|@critical"` takes over once the suite outgrows the 10-minute budget.
- The Playwright Docker image waits for visual tests (Phase 3); CI keeps `playwright install --with-deps chromium`.

What it took to make the suite steady under 8 parallel workers (first 20× runs failed in the first ~25 tests):
- **The API is warmed up before it reports healthy** (`e2e/harness/warmup.mjs`): every handler imported, every model's collection and indexes built (≈2.5 s). Cold, the first requests from 8 workers at once waited on lazy imports and index builds long enough for 10 s expectations to time out.
- **Passwords hash at bcrypt cost 4 in the e2e API** (`serve-api.mjs`). `bcryptjs` is plain JavaScript on the API's one thread: ~120 ms per hash at cost 10, enough to stall the API when workers seed accounts and sign in together. The tests check that passwords work, not how slowly.
- **The API logs when its event loop was blocked ≥ 1 s** (`[e2e] the API's event loop was blocked for … ms`), so a stalled API shows up as the cause instead of as unrelated timeouts.
- Control calls use a fresh connection and retry once (Node's keep-alive race otherwise surfaces as `ECONNRESET`).

Found while building it:
- **Fixed — signing out could leave the session alive.** `AuthContext.logout` set `isAuthenticated` to false first, so the router's `<GoToLogin/>` did a full page load to `/login?redirect=…` within milliseconds, cutting off the logout request and the clearing of on-device data that `client.logout` waits up to 2.5 s for. On a slow connection the cookie survived and the sign-in page signed the person straight back in. Now the app holds on the splash while signing out. Regression test: `specs/auth/signin.spec.js` "signing out on a slow connection…" (fails on the old code).
- **Fixed — the live refresh could miss a change made while a page was loading.** `useWorkspaceSync` took its first pulse as the baseline, so a change landing after the page read its lists but before that pulse answered stayed unseen until the next change. Reads now carry the household's data revision (`X-Data-Rev`, set by the auth middleware on GETs); a pulse showing the household past the oldest revision on screen refetches once (`src/lib/dataRev.js`). Test: `specs/offline/reopen.spec.js`, "a change made after the page loaded its lists…" (fails without the fix).

### 0.2.2 Phase 1 status (3 Oct 2026)

Every P0 row of §3 has a test, except TX-N02 (below). Specs by area, all tagged `@critical` (`@smoke` on the
fastest end-to-end path through each area):

| Area | Spec | Rows |
| --- | --- | --- |
| Auth | `specs/auth/signin.spec.js`, `passkey.spec.js` | AUTH-H01–H04, H09, H15, N01–N03, slow-network sign-out |
| Account | `specs/account/preferences.spec.js` | ACC-H01, ACC-H02 (en → he RTL → ru) |
| Household | `specs/household/invitations.spec.js`, `specs/harness.spec.js` | WS-H01 (email link → sign-up → joined), WS-H10 (live refresh) |
| Money | `specs/money/transactions.spec.js`, `categories-budgets.spec.js`, `ingest.spec.js`, `import.spec.js` | TX-H01–H04, H10, N01, typing survives a refresh; CAT-H01, BUD-H01; ING-H01, ING-N01; IMP-H01, IMP-H03 |
| Dashboard | `specs/dashboard/safe-to-spend.spec.js` | DSH-H01 (exact figures from the bar's label), DSH-N01 |
| Plans · Loans · Savings · Tasks | `specs/plans`, `specs/loans`, `specs/savings`, `specs/tasks` | PL-H01, H02, E03 (two people, one plan); LN-H01, H02, N02; SV-H01, H02; TK-H01 (assigned to a member), TK-H02 (logs the cost, moves a year on) |
| Notes · Groceries | `specs/notes`, `specs/groceries` | NT-H01, H02; GR-H01, H02, H06 (shop picked, items ticked, prices kept by shop) |
| Offline | `specs/offline/offline.spec.js`, `reopen.spec.js`, `resilience.spec.js` | OFF-H01–H03, OFF-E01 (lost answer → no duplicate), reopening shows others' changes |
| Shell · Security | `specs/shell/navigation.spec.js`, `layout.phone.spec.js`, `specs/security/isolation.spec.js` | NAV-H01, H02, N01; SEC-H01, N01, N02, N04, N05 |
| Journeys | `specs/journeys/new-household.spec.js`, `apple-pay-week.spec.js` | J-01, J-05 (+ CHK-H01, CHK-H02) |

Test data goes in through the app's own API as the signed-in person (`api` fixture, `support/api.js`,
`support/factories.js`); the behaviour under test always goes through the screens.

Found while writing them:
- **Fixed — typing in the expense dialog was wiped by a refresh.** Its set-up effect depended on the categories list
  and the currency, so whenever the household's lists refreshed while it was open (a partner adding something; a new
  account's categories arriving) the form reset and lost what was being typed. Now it sets up only when it opens.
  Regression test: "what you are typing survives a change someone else makes meanwhile" (failed 3/3 before).
- **Fixed — reopening the app could keep showing old numbers.** The query client had `refetchOnMount: false`, so lists
  restored from the device and marked stale at start-up were never refetched by pages that mounted after the restore
  (most of them: pages load lazily). A partner's expenses stayed invisible until something else changed. Now
  `refetchOnMount: true`, which still skips fresh data. Regression test: `specs/offline/reopen.spec.js` (failed 4/4
  before); it also made the budget-on-Dashboard test pass, which was failing for the same reason.
- **Fixed — without the lazily loaded animation code the app was invisible.** Pages and most content fade in from
  opacity 0 through Motion, and its animation code used to be imported after start-up; if that download failed (a
  weak connection on a first visit or right after an update) everything stayed at opacity 0, and while it was slow
  everything was invisible. Retrying the import cannot help (browsers cache a failed dynamic import). The features
  (`domMax`) now come with the first download: +18 KB gzipped on the 244 KB entry. Regression test: "the app shows
  even when no animation code can be downloaded later" (`specs/offline/resilience.spec.js`).
- **Fixed — "Select a category" could stay on screen next to a selected category.** On a brand-new account the
  dialog can open before the categories have loaded; saving then said "Select a category", and when the categories
  arrived one was chosen but the message stayed until the next save. It now goes as soon as there is a category.
- **Fixed — the invite dialog kept its spinner after "Invitation sent".** The toast showed when the invitation was
  made, but the dialog waited for a full workspace refresh before showing its "sent" view; the refresh now runs
  behind it.
- **TX-N02 through the race above:** the picker always starts with a category once they have loaded, so the test
  holds the categories response back (`specs/money/categories-budgets.spec.js`), saves, sees "Select a category",
  then lets them arrive and sees it go.
- **Noted — refusal codes differ by route** for someone outside the household: 404 for most lists, 403 from some,
  400 ("Workspace context required") from categories. All refuse with no data; the test accepts any 4xx without data.

### 0.2.3 Phase 2 status (in progress)

Done so far:

| Area | Spec | Rows |
| --- | --- | --- |
| Accessibility | `specs/cross/a11y.spec.js` | WCAG 2.2 A/AA with axe in the browser (contrast included): Dashboard, Expenses, Plans, Notes, Settings and the expense dialog, in all 7 palettes × light/dark |
| Permissions | `specs/household/permissions.spec.js` | §3.4 matrix: viewer, editor, notes-only, no-goals; UI hidden and API refused |
| Members | `specs/household/members.spec.js` | WS-H05 (live), H07, H08, H09, WS-N01, N02, N07, N08, N10, TX-N08 |
| Assistant | `specs/dashboard/assistant.spec.js` | AI-H01, H02, H04, AI-N01, N03, overloaded, declined |
| Groceries | `specs/groceries/groceries.spec.js` | AI-H06 / GR-H06: receipt photo read, saved as the expense, prices kept |
| Review | `specs/review/review.spec.js` | RV-H01, H02, RV-N01, RC-H01, RC-H02 (the card downloaded, with the month's figures), RC-E01 (blurred: the card handed to the share sheet holds percentages only; read from what is drawn on the canvas) |
| Account security | `specs/account/security.spec.js` | AUTH-H11 (reset ends other sessions), N09, H12, H14, N05 (lockout), N15 (open redirect), E01 (session replaced, told why), E02 (expired) |
| Google | `specs/auth/google.spec.js` | AUTH-H07, H08, N11 (wrong audience, unverified email) |
| Your data | `specs/account/data.spec.js` | EXP-H01, EXP-E01 (formula injection, BOM), CRD-H01, N01, ACC-H08, N01 |
| Phone, every language | `specs/shell/layout.phone.spec.js` | all 11 pages × en/he/ru: no sideways overflow, 44px tap areas (§4.1.3), `dir`/`lang`, no untranslated key; sign-in in each language |
| Hebrew | `specs/cross/rtl.spec.js` | I18N-H01: mirrored layout, an expense added through the Hebrew screens, numbers left-to-right inside, translated categories and months |
| In-between sizes | `specs/shell/layout.sizes.spec.js` | every page at 768, 1024 and 1280 px |
| Keyboard alone | `specs/cross/keyboard.spec.js` | §4.3.3: signing in, adding an expense (focus kept inside the dialog, back on the button after), Escape returning focus, visible focus on the Dashboard's first 40 Tab stops |
| Reduced motion | `specs/cross/motion.spec.js` | §4.3.6: sign-in and Dashboard hold still (no drawn shape changes, no looping animation but spinners), with a control that the check sees motion when the setting is off |
| Calendar | `specs/calendar/calendar.spec.js` | CAL-H01 (connect once, Google's events shown), H02 (create, rename, delete in Google), H03 (task added, marked done), H06 (disconnect revokes the grant), N01, N02 (access taken back → asked to reconnect, still signed in; Google failing → not saved, form kept), E02 (another device opens it connected), H05 (day/week/month, Next and Today, a layer off and remembered), N03 (Google's script unreachable), H04 (dragged an hour later, stretched half an hour, Escape cancels), E01 (a three-day trip on each day, an overnight event on its start day, a crowded day's "4 more"), Google granting no refresh token → "connect once more" |
| Visual | `specs/visual/screens.visual.spec.js` (project `visual`) | §4.4, first set: sign-in (en, he), Dashboard (dark, light, phone), Expenses, the add-expense dialog, Settings; approved screenshots from Linux in CI |
| Hardening | `specs/security/hardening.spec.js` | SEC-N03, N06, N07 (owner and household come from the session), N08 (cron secret), N09 (bad ids), E01 (code-like text on 8 screens and in the invitation email) |
| Offline sync | `specs/offline/outbox.spec.js` | OFF-H04 (edit and delete offline, applied in order), H05 (a task ticked offline), N01 (a change refused after losing permission: "could not sync", Try again refused again, Throw away), E02 (a dropping connection sends five changes exactly once), E04 (an edit to a row deleted meanwhile is dropped, not stuck) |
| Failure states | `specs/shell/failures.spec.js` | DSH-N02, NAV-N02-N04: a server error, a broken answer, too many requests and the database down each say the numbers are not complete; Try again recovers; Expenses and Review too |
| Ingest edges | `specs/money/ingest-edges.spec.js` | ING-H02 (texts: a purchase in; codes, refunds, declines out), H03 (Apple Pay and the bank text merge into one row), N02 (five devices), N03 (405, 413, bad JSON, unknown kind), N04 (absurd amount), N05 (a demoted member's key refused), the same tap sent twice |
| Budgets | `specs/money/budgets.spec.js` | BUD-H02 (approaching, over by $100), H03 (on pace to pass it around a date), Dashboard over and all on pace, N02 (0 and negative limits refused by the form and the server); the clock fixed at 10 June 2026 |
| Month edges | `specs/dashboard/month-edges.spec.js` | DSH-E01 (first and last day: no broken numbers; no "a day for" line on the last day), H03 (a past month is closed, with its net), H04 (repeating payments found, the raised one says "up from"); the clock fixed per test |
| Settings | `specs/account/settings.spec.js` | ACC-H03 (currency re-totals the Dashboard at the stubbed rate), H07 ("/", Escape, nothing found), N03 (a failed save says so and shows what is saved), a server error on the background session check keeps you signed in |
| Idle cost | `specs/shell/idle.spec.js` | §4.5: an idle Dashboard stays within its 18 requests a minute, each kind within its rate; a hidden tab asks nothing and catches up when back |
| Import edges | `specs/money/import-edges.spec.js` | IMP-H02 (a workbook's purchases sheet found, negative charges read, sent to review), N01 (a picture or a contacts file: nothing to import), N02 (2,001 rows: the screen says so, the server refuses), N03 (a server failure writes nothing), E01 (Hebrew headers, day-first dates, "1,250.00", a zero row skipped) |
| Gestures | `specs/shell/gestures.phone.spec.js` | NAV-H07: a full pull from the top refreshes (with the change pulse silenced, so only the pull can), a short pull does not; NAV-H03/H04 obsolete (no dock) |
| Savings, loans, plans | `specs/savings`, `specs/loans`, `specs/plans` | SV-H03 + N02 (take out; more than saved refused with the amount), H04 (target reached, marked done); LN-H03 (extra payment to the balance), H05 (money lent: repayments until repaid in full); PL-H03 (booked, then paid as a linked expense), H04 (removed cost, Undo), E01 (over budget, unassigned budget) |
| Note sharing | `specs/notes/sharing.spec.js` | NT-H07/H08 (view only, then editor; "Edited by" with the person's name), N03 (only the owner shares or trashes), N04 (a reader of a household note cannot delete it), H09 (leaving a privately shared note), E01 for checklists (two ticks at once both kept) |
| WebKit | `desktop-webkit`, `phone-webkit` projects | the whole suite, in CI on every push to main (not required yet) |

Every planned calendar row is covered. Note: an event across midnight shows on its start day only, by design (`buildDayMap`).

Harness: Google's OAuth token endpoint, Calendar and Tasks are faked in memory per test (`harness/googleApis.mjs`, seeded and read through the control server; `calendar` scenario: ok / revoked / no-refresh / down), and the e2e API runs with a client secret so the calendar connects for the account. The fake Google script is installed before the app runs (see the WebKit note below).

Anthropic (`api.anthropic.com`, per-test `ai` scenario: ok / refusal / overloaded / not-a-receipt) and Google
tokeninfo stubbed in the e2e API; `support/google.js` crafts Sign-In credentials; `settleAnimations()` before axe.

Found while writing them:
- **Fixed — the assistant could never log an expense or read a receipt.** `server/lib/assistant.js` built its
  structured-output schemas with zod 3's `z`, but the Anthropic SDK's helper reads Zod 4 schemas, so every parse and
  receipt call threw ("Cannot read properties of undefined (reading 'def')") before reaching the API; only questions
  worked. The unit tests mock the SDK, so they could not see it. Now `zod/v4` (shipped inside zod 3.25).
- **Fixed — editors could add, change and remove cards through the API.** The cards endpoint required
  `editExpenses`; the app reserves cards for the `manageCards` permission (owners, admins, or members given it). Now
  writes need `manageCards`; reading stays with `viewExpenses`.
- **Fixed — accessibility:** Groceries' view tabs pointed `aria-controls` at a panel that is not there while loading or
  on an empty list (critical); four colours were under 4.5:1 as text (success green on light cards; the gold, graphite
  light and indigo dark primaries), nudged a few points of lightness.
- **Fixed — a device signed out from elsewhere bounced back into the app and lost the reason.** On a 401 with a
  reason (signed in on too many devices, signed out remotely) the API client went to `/login?reason=…` but left the
  saved session on the device, so the sign-in page reopened the app on it; and `AuthContext` sent the page to
  `/login` a second time without the reason (the later address wins). Depending on timing the device stayed on the
  Dashboard with the household's numbers. Now the saved session is cleared on that path and the app holds on the
  splash while the client navigates.
- **Fixed — an open app never noticed a session that ended without a reason** (no cookie any more, e.g. it
  expired while the app stayed open): the 4-second check swallowed the 401 and the screen kept showing old numbers.
  A 401 there now re-checks the session, which goes to sign in.
- **Fixed — controls under 44px to tap on phones** (DESIGN.md asks for 44px on coarse pointers): the install hint's
  dismiss button (40px, on every page), the Notes section chips (40px tall, and their scrolling strip clipped any
  larger tap area), the Notes search and filter buttons (40px) and the Groceries view tabs (32px). Each got an
  invisible tap area on touch screens, as the design system prescribes for small buttons; nothing looks different.
  The check counts tap areas, not drawn boxes (`smallTouchTargets()` in `support/layout.js`).
- **Fixed — closing a dialog dropped keyboard focus on the page body** (WCAG 2.4.3). Radix returns focus only to its
  own `Trigger`; the app opens nearly every dialog from an ordinary button with controlled state, so after Save,
  Cancel or Escape a keyboard or screen-reader user started again from the top of the page. `useReturnFocus` (in
  `components/ui`) remembers what had focus when the content mounted and returns there, in the shared dialog, drawer
  and alert dialog. A field with `autoFocus` takes focus before Radix's open event (which Radix then skips), so the
  opener comes from a short focus history, not `document.activeElement`.
- **Fixed — reduced motion was ignored by the two drawn animations:** the climber on the sign-in page and the
  animated logo (sidebar, phone island, splash, Settings) kept moving with the setting on. Both now hold a still pose
  (the climber in the V after landing when celebrating, without confetti).
- **Fixed — the calendar asked Google for its logo.** The Connect button loaded Google's "G" from gstatic.com, a
  request to Google each time someone opened the calendar unconnected, and a broken image offline. It now uses the
  mark the sign-in page already draws.
- **Fixed — two calendar buttons were both called "Next"** (and two "Previous"): the toolbar's, which moves the
  view, and the small month's, which moves only that month. The small month's now say "Next month" / "Previous month".
- **Fixed — Notes showed people as the start of their email address.** "Edited by user-2e5ea348", "From dana.levi":
  Notes built its list of people from email addresses and ignored the names the server sends with each member,
  which the rest of the app shows. Now it uses the name, and the address only when there is none.
- **Open — leaving a note shared with the whole household does not take it away.** Notes are shared with the
  household unless set otherwise; "leave" removes you from the named people and reports success, but the household
  share still shows it to you. Hiding it per person (or offering leave only on privately shared notes) would fix it.
- **Open — two people editing a note's text at once: the later save wins.** Checklists merge (tested); a note's
  title and body have no conflict check, so one person's edit can silently replace the other's. A fix needs the
  editor to send the version it started from and a way to show the conflict; a design decision.
- **Fixed — one server error could sign you out.** When the app re-checked the session behind an open page (after
  saving a setting, say) and that request got a 500 or an unreadable answer, it treated the session as over and
  went to sign in. Only a 401/403 ends a session now; other errors during a background check keep it.
- **Fixed (minor) — the Dashboard's chart said "No transactions this month" while the month was still loading**, next
  to a Net Amount showing "…"; under load it read as an empty month for a few seconds. It shows a placeholder now.
- **Fixed — a failed load looked like an empty month.** When the transactions could not be loaded (a server
  error, a broken answer, too many requests, the database down), the Dashboard said "No transactions this month" and
  "All clear. This week: $0", Expenses showed an empty year, and nothing said anything had failed. With nothing
  cached, Dashboard, Expenses/Income and Review now say "Your transactions could not be loaded, so the numbers here
  are not complete" with Try again. (Rows already on the device still show during a later failure, as offline.)
- **Fixed — the API took a budget of zero or less.** The form refuses one (the field allows 0.01 and up), but
  the server stored any number, so a negative budget sent another way was kept. The model now requires a limit
  above zero, on create and on change.
- **Fixed — the invitation email's text part showed HTML entities.** It was the HTML with its tags removed, so a
  household called "Levi & Sons" read "Levi &amp; Sons" in mail apps that show the text version. The escaped
  characters are now turned back. (The HTML version was, and is, escaped: no markup from a name gets through.)
- **Harness — in WebKit, `page.route` does not see requests from a page the service worker controls.** A failure staged
  with a route reached the page only when it won the race against the worker taking over. Specs that stage API
  failures run with `serviceWorkers: 'block'` (`specs/shell/failures.spec.js`).
- **Harness — WebKit once fetched Google's real script past the network guard.** One run in 24 loaded the real
  `gsi/client` (Google's own response headers in the trace) although the route serves a fake; the real script then
  opened Google's real sign-in popup, which the guard caught and failed. The fake is now installed before the app
  runs, so the app never requests the script.
- **Fixed — a declined request read as a failure.** `messages.parse()` read the empty answer as JSON before
  `assistant.js` checked `stop_reason`, so people saw "something went wrong" instead of the declined message. Notes
  and receipts now go through `create`, the decline is checked first, then the text is parsed with the same schema.
- **Fixed — leaving a household lost its confirmation.** "You left the workspace" was shown, then the app reloaded
  on its home page and the toast went with it. It is now kept for the tab across the reload and shown once the app
  is back (`lib/toastAfterReload.js`).
- **Needs a real iPhone — Settings stops the main thread in Playwright's WebKit.** About a second after Settings opens,
  WebKit (the Windows and the Linux builds alike) runs no more JavaScript at all: a 250 ms heartbeat stops and even a
  3 s timer never fires. Ruled out: backdrop blur, `text-wrap: pretty`, and the passkey, notification, permission and
  service-worker APIs (none is called before it stops). Elsewhere WebKit is slow but alive (Dashboard 9 fps, Expenses
  19 fps, against 37 and 62 in Chromium). The sign-in screen does not freeze, but in CI its controls never settle
  for clicks. **Check on an iPhone: open Settings in Safari and in the installed app; does it freeze?** If it does, it
  is urgent; if not, it is an artefact of the headless engine. Until then the specs that go through Settings or the
  sign-in screen do not run in WebKit (`WEBKIT_PENDING` in `playwright.config.js`).
- **Offline is not testable in Playwright's WebKit:** any page load made offline under the service worker fails with
  "WebKit encountered an internal error". Offline specs run in Chromium only (`WEBKIT_UNSUPPORTED`).
- **WebKit result:** the other 54 tests (money, dashboard, plans, loans, savings, tasks, notes, groceries, review,
  security, navigation, phone layout) pass in WebKit **on Windows**, 2 minutes for both projects
  (`npm run test:e2e:webkit`).
- **Fixed in the harness — WebKit on GitHub's Linux runners loaded no page.** Every `page.goto` hung. A trace
  showed why: "Not allowed to use restricted network port 4190". The e2e app's default port, 4190 (ManageSieve), is on
  the browsers' blocked-port list, which WebKit enforces; local runs used 4390 and passed. The app is now on 4180.
  With pages loading, the Linux job then showed two kinds of navigation noise from WebKit: a page's code or a
  request still loading when the test reloads or moves on is reported as "Importing a module script failed" or
  "...due to access control checks". The error watcher strikes those off only when the page does navigate within
  two seconds. Settings freezes Playwright's WebKit on Linux too, so `layout.sizes` skips it there.
- **Fixed in the harness — "offline" did not wait for the app to be cached.** `installOffline` waited only for the
  service worker to control the page, so a page's code still being cached was missing offline (WebKit caches more
  slowly than Chromium). It now waits until the precache holds every file in `sw.js` (the list names five icons
  twice; Workbox stores them once).

### 0.3 Guiding principles

1. **Test the product, not the plumbing.** E2E owns what only a real browser + real API + real DB can prove: cross-layer journeys, cookies/sessions, the service worker and offline queue, two people on one household, layout and real-render accessibility. Math (forecast, interest, budgets) is already unit-tested; E2E checks one representative figure per screen.
2. **Real backend, fake world.** Never mock Ascent's own API in a journey test. Mock only third parties (exchange rates, Google, Anthropic, Web Push, SMTP), and inject faults with `page.route` only in tests that are *about* faults.
3. **One household per test.** Every test creates its own user(s) and workspace. No test reads another test's data, so order never matters and everything can run in parallel.
4. **Selectors are the accessibility contract.** `getByRole` / `getByLabel` first (the current convention). A test that can't find a control by its accessible name has found an a11y bug.
5. **Labels come from the translation files**, never retyped, so copy changes don't break tests and the same test can run in Hebrew or Russian.
6. **No sleeping.** Web-first assertions and `expect.poll` only; `waitForTimeout` is banned by lint.

---

## 1. E2E Testing Strategy & Tooling

### 1.1 Framework: Playwright (keep it)

| Need in Ascent | Playwright | Cypress |
| --- | --- | --- |
| Passkeys / Face ID lock (WebAuthn) | CDP virtual authenticator (already used) | No first-class support |
| Service worker, offline queue, `context.setOffline` | Yes, per context | Partial; SW support is weak |
| **Two household members at once** (live refresh via `pulse`, sharing, invitations) | Multiple isolated `BrowserContext`s in one test | One browser, one origin per test |
| iPhone Safari (primary audience) | WebKit engine + device descriptors | WebKit experimental |
| Touch: long-press `+`, swipe-down sheets, pull-to-refresh | `page.touchscreen`, `hasTouch`, `isMobile` | Limited |
| Fake clock for idle sign-out (10 min), app lock, reminders, month boundaries | `page.clock` | `cy.clock` (OK) |
| Downloads (CSV export), file uploads (statement import, receipt, note files) | Native | Plugins |
| Debugging failures | Trace viewer (DOM, network, console per step), video | Time-travel UI |
| Parallel + sharding | Built in, free | Paid dashboard for good parallelism |

Versions: `@playwright/test ^1.63` (installed). Add dev deps: `@axe-core/playwright`, `eslint-plugin-playwright`,
`smtp-server` + `mailparser` (email sink).

### 1.2 Where E2E sits in the pyramid

```
                    ┌───────────────────────────┐
  nightly / deploy  │ Real devices · prod smoke │  handful: install PWA on iPhone, Face ID, push
                    ├───────────────────────────┤
  E2E (this plan)   │ Playwright: ~300 tests    │  journeys, sessions, offline, multi-user, layout, a11y, visual
                    ├───────────────────────────┤
  integration       │ Vitest pages + fakeApi    │  every screen × 3 languages, translations, axe (markup)
                    ├───────────────────────────┤
  unit              │ node --test               │  handlers, money, forecast, roles, ingest parsing, limits
                    └───────────────────────────┘
```

Rule of thumb for "does this belong in E2E?": *does it need a real browser, a real HTTP round-trip, or two
people?* If not, push it down a layer.

### 1.3 Environment architecture

```
 Playwright runner (N workers)
   │  each test: fresh BrowserContext(s) = clean cookies, IndexedDB, SW caches, localStorage
   │  extraHTTPHeaders: X-Forwarded-For: 10.0.<shard>.<worker>   ← partitions rate limits
   ▼
 vite preview :4180  (production build, real service worker)
   │  /api/* proxied (API_PROXY_TARGET)
   ▼
 e2e/serve-api.mjs :3102  ── the real Express app (server/server.js)
   ├─ MongoMemoryServer                     throwaway DB (standalone; nothing uses transactions)
   ├─ outbound fetch stub                   exchange rates now; Google, Anthropic added with their tests
   ├─ control :3103 (127.0.0.1, e2e only)   seed users/members/sessions, read mail, per-test stub scenarios
   └─ SMTP sink :3104 (127.0.0.1)           captures every email
```

#### 1.3.1 Production build, not the dev server
Keep testing `vite build && vite preview`: it is what ships, it includes the service worker (Workbox via
`vite-plugin-pwa`), code-split lazy routes and the real CSP-compatible bundle. Use the dev server
(`ascent-dev-e2e` in `.claude/launch.json`) only when writing tests locally (`npx playwright test --ui`).

#### 1.3.2 The API process
`e2e/serve-api.mjs` already deletes `SMTP_ / EMAIL_ / SENTRY_ / VAPID_ / ANTHROPIC_ / GOOGLE_ / VITE_` env vars
and points `MONGODB_URI` at an in-memory server. Extend it to:

- Start Mongo as a **replica set** (`MongoMemoryReplSet`) so anything that uses sessions/transactions behaves like Atlas.
- Write `{ mongoUri, jwtSecret, apiPort, controlPort }` to `e2e/.state/api.json` for the seeding helpers.
- Set `CRON_SECRET=e2e-cron`, `FRONTEND_URL=http://localhost:4180`, fake `VAPID_*` keys (push routes become testable; delivery goes to the stub), and — per scenario — `ANTHROPIC_API_KEY=e2e-fake`, `GOOGLE_CLIENT_ID=e2e-client`.
- Expose a **control server on a separate port that only the test runner knows** (never mounted on the app, never in production code): `POST /stubs` (set scenario), `GET /mail?to=`, `DELETE /mail`, `POST /clock` (optional, see §1.4.5).

#### 1.3.3 Third-party stubs (makes the suite hermetic)

| Third party | Called from | Stub | Scenarios to support |
| --- | --- | --- | --- |
| `api.exchangerate-api.com/v4/latest/USD` | app (`useWorkspaceData.js`) **and** API (`server/lib/rates.js`) | app: `context.route`; API: fetch stub in `serve-api.mjs` | fixed rates (USD 1, ILS 3.7, EUR 0.92, RUB 90); 500; timeout; malformed (`rates.USD !== 1`) |
| `accounts.google.com/gsi/client` (Google Sign-In) | Login, AcceptInvitation, Calendar | `context.route` serves a tiny fake GSI that renders a button and calls the callback with a crafted credential | success, user closes popup (`select_by: 'user'`, no credential), script fails to load |
| `oauth2.googleapis.com/tokeninfo` | `server/lib/googleAuth.js` | API fetch stub | valid token for `e2e-client`, wrong `aud`, expired, unverified email |
| `oauth2.googleapis.com/token`, `/revoke`; `googleapis.com/calendar/v3`, `tasks.googleapis.com` | Calendar integration | API fetch stub with an in-memory calendar | connected, 401 expired, 403 scope missing, 404, 5xx |
| Anthropic Messages API | `server/api/assist.js`, `server/lib/assistant.js` | API fetch stub returning canned tool-use / text responses | parse expense, answer question, read receipt, refusal (`ai_declined`), 529 overloaded, timeout |
| Web Push endpoints | `server/lib/push.js` (`web-push`) | Subscribe the browser to a local push endpoint; stub records payloads | delivered, 410 Gone (subscription removed) |
| SMTP | `server/lib/email-helper.js` | In-process SMTP sink (§1.3.4) | delivered; sink down → "email could not be sent" paths |
| Vercel Analytics / Speed Insights | app | `context.route('**/_vercel/**', r => r.fulfill({ status: 204 }))` | — |
| Sentry tunnel `/api/monitoring` | app | Already harmless (`VITE_SENTRY_DSN: ''`) | — |

A global guard fails the run if any request leaves `localhost` unexpectedly:
`context.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, r => { unexpected.push(r.request().url()); r.abort(); })`.

#### 1.3.4 Email sink
`smtp-server` in `serve-api.mjs` on `:2525` with `authOptional: true`, `disabledCommands: ['STARTTLS']`; env
`SMTP_HOST=127.0.0.1 SMTP_PORT=2525 SMTP_USER=e2e SMTP_PASS=e2e`. Parse with `mailparser`, keep in memory.
Helper:

```js
// e2e/support/mail.js
export async function lastLink(request, to, pathPrefix) {        // e.g. '/reset-password/'
  await expect.poll(async () => (await (await request.get(`${CONTROL}/mail?to=${to}`)).json()).length).toBeGreaterThan(0);
  const [mail] = await (await request.get(`${CONTROL}/mail?to=${to}`)).json();
  return new URL(mail.html.match(new RegExp(`https?://[^"']+${pathPrefix}[^"']+`))[0]).pathname;
}
```

### 1.4 Test data strategy

#### 1.4.1 Real database, never the app's own API mocked
- Journeys run against the real API and MongoDB. Data is created through the **fastest legitimate path**: direct DB seeding for preconditions, the UI only for the behaviour under test.
- Fault injection (`page.route(... r.fulfill({ status: 500 }))`) is used only in *Negative* tests about the client's error handling, and the test name says so.

#### 1.4.2 Isolation: one household per test
- Emails: `${label}-${testInfo.workerIndex}-${Date.now()}-${n}@e2e.test` (extends today's `newEmail`).
- Each test gets its own user + workspace, so tests never collide even in parallel, and the in-memory DB is simply dropped at the end (no teardown code).
- Shared read-only fixtures (e.g. a 14-month history household used by 20 Review tests) are created **once per worker** (`{ scope: 'worker' }`) and never written to.

#### 1.4.3 Seeding without hitting sign-up rate limits (fixes G1)
> **As built** (see §0.2.1): seeding runs inside the API process behind the control server
> (`e2e/harness/control.mjs`), called from `e2e/support/control.js`; `e2e/fixtures.js` is the real version of
> the sketch below. The sketch is kept for the reasoning.

The seeding reuses the server's own code, so seeded accounts are identical to real sign-ups (default
categories, workspace, prefs):

```js
// e2e/support/seed.js  (sketch)
import mongoose from 'mongoose';
import { createAccount } from '../../server/lib/accounts.js';
import { issueSession } from '../../server/lib/session.js';

export async function seedUser({ email, name = 'Dana Test', language = 'en', theme = 'dark' }) {
  const user = await createAccount({ email, password: PASSWORD, full_name: name, language, theme });
  const token = await issueSession(user, { userAgent: 'Playwright' });   // same JWT_SECRET as the API
  return { user, cookie: { name: 'ascent_session', value: token, domain: 'localhost', path: '/api',
                           httpOnly: true, sameSite: 'Strict', secure: false } };
}
```

```js
// e2e/fixtures.js  (sketch) — every spec imports `test` from here instead of @playwright/test
export const test = base.extend({
  owner: async ({ context }, use, info) => {
    const h = await seedHousehold({ tag: info.testId });            // user + workspace + default categories
    await context.addCookies([h.owner.cookie]);
    await context.addInitScript((ws) => {
      localStorage.setItem('ascent_signed_in', '1');
      localStorage.setItem('ascent_current_workspace_id', ws);
    }, h.workspaceId);
    await use(h);
  },
  partner: async ({ browser, owner }, use) => {                       // a second member, own browser
    const m = await addMember(owner, { role: 'editor' });
    const ctx = await browser.newContext(); await ctx.addCookies([m.cookie]);
    await use({ ...m, page: await ctx.newPage() }); await ctx.close();
  },
  viewer: /* same with role 'viewer' */,
  stubs:  /* sets third-party scenarios through the control port, resets after */,
});
```

UI sign-up/sign-in stay covered — in the auth specs only, where they are the behaviour under test.
Additionally, give each worker its own client IP (`use: { extraHTTPHeaders: { 'X-Forwarded-For': ... } }`;
the API sets `trust proxy`), so rate-limit counters never bleed between workers and the rate-limit tests can
drive a fresh IP to exactly 429.

#### 1.4.4 Factories and named scenarios
`e2e/support/factories.js` — one builder per collection with sensible defaults, all overridable:
`transaction()`, `income()`, `installmentPurchase()`, `recurringSeries()`, `budget()`, `category()`, `card()`,
`plan({ template: 'vacation' })`, `commitment({ direction: 'owe' | 'owed' })`, `goal()`, `task()`, `note()`,
`checklist()`, `groceryItem({ purchases })`, `ingestToken()`.

Named scenarios (`seedScenario(name)`), built from those factories and from `server/scripts/seed-test-data.mjs`:

| Scenario | Contents | Used by |
| --- | --- | --- |
| `empty` | New account, default categories only | Empty states, onboarding, first-run welcome |
| `typical-month` | ~40 expenses this month, salary, 5 budgets (1 over, 1 near), 2 cards | Dashboard, Expenses, Check-in |
| `history-14m` | 14 months of realistic spending, subscriptions with a price rise, installments | Review, Recap, subscriptions, YoY, browsing back past the 14-month window |
| `multi-currency` | User currency ILS, rows in USD/EUR/RUB | Conversion, totals, rates-down fallback |
| `household-3` | Owner + admin + viewer, `paidBy` spread across members | Permissions, "Who paid", sharing |
| `hebrew-household` | `language: 'he'`, Hebrew merchants (`seed-hebrew-test-data.mjs`) | RTL journeys |
| `big-data` | 5,000 transactions, 500 notes, 300 grocery items | Performance, virtualisation, limits |
| `loans` | Mortgage with interest, interest-free loan, money lent with no schedule | Loans pages |

All dates are generated **relative to now** (`subDays(now, 3)`), never hard-coded.

#### 1.4.5 Time
- **Client timers** (idle sign-out 10 min + 1-min warning, app lock after 10 idle min, note reminders checked every 30 s, recap at month start, `PULSE_MS` 4 s): `await page.clock.install({ time })` then `page.clock.fastForward('10:00')`.
- **Server "today"** (trash purge after 7 days, task reminders, cron summaries) is real time on the API. Seed records with back-dated timestamps (e.g. a note trashed 8 days ago) rather than moving the server clock. Optional later: an E2E-only clock offset in `serve-api.mjs` via the control port.
- **Time zones**: run date-sensitive specs under `timezoneId: 'Asia/Jerusalem'` (the main audience) **and** `'America/Los_Angeles'`; month-boundary tests set the clock to 23:30 local on the last day of the month.

#### 1.4.6 Client state management
- New context per test = empty cookies, `localStorage` (`ascent_signed_in`, `ascent_current_workspace_id`, login language, sidebar state), IndexedDB (persisted TanStack Query cache, outbox), Cache Storage (service worker).
- Persistence tests (offline, reload, app lock) stay inside one context and `page.reload()`.
- Helpers to *inspect* state: `outboxSize(page)` (IndexedDB), `serverList(page, entity)` (exists), `sessionCookie(context)` (exists).
- Reuse of signed-in state via `storageState` files is **not** recommended here: sessions are per-device (max 10 per user) and tests mutate data; per-test seeding is fast (~50 ms) and isolated.

#### 1.4.7 Selectors and translations
```js
// e2e/support/i18n.js
import en from '../../src/lib/i18n/en.js';
import he from '../../src/lib/i18n/he.js';
export const L = (key, vars = {}, dict = en) => dict[key].replace(/\{(\w+)\}/g, (_, k) => vars[k]);
// page.getByRole('button', { name: L('addExpense') })
```
Add `data-testid` only where there is no accessible name worth asserting (chart canvases, sparkline cells,
grocery wall tiles' fill level). Never select by CSS class (Tailwind classes change constantly).

#### 1.4.8 Screen objects (thin)
`e2e/screens/<Screen>.js` exposes intent-level actions (`expenses.add({ amount, category, description })`,
`plans.addCost(...)`) and nothing more. Assertions stay in specs.

### 1.5 Environments

| Environment | Purpose | Data | Runs |
| --- | --- | --- | --- |
| **Local** | Writing/debugging tests | In-memory Mongo, stubs | `npm run test:e2e`, `npx playwright test --ui`, `--debug` |
| **CI ephemeral** | Gate every PR and push | In-memory Mongo, stubs | GitHub Actions (§5) |
| **Vercel preview** | Smoke the real deployment (serverless cold starts, rewrites, CSP headers, cron routes) | Separate Atlas **test** cluster, a dedicated seeded account reset before each run | On `deployment_status` success; protection bypass via `x-vercel-protection-bypass` secret |
| **Production** | Synthetic monitoring | No writes. `GET /api/health`, sign-in page renders, security headers present | Every 30 min (scheduled workflow) |

Never point the full suite at production data. The preview smoke uses `@smoke`-tagged tests that create and
delete their own rows inside the dedicated test account.

### 1.6 Proposed layout

```
e2e/
  TEST_PLAN.md                  this document
  serve-api.mjs                 API + Mongo, then the harness below
  build-app.mjs                 the one test build (local and CI)
  harness/  control.mjs outbound.mjs mailSink.mjs        (run inside the API process)
  fixtures.js                   test.extend: testKey, owner, member(role), openDevice, mail, stubs
  support/  env.js control.js network.js i18n.js app.js layout.js   (+ factories.js, a11y.js in later phases)
  screens/  LoginScreen.js SettingsScreen.js ExpensesScreen.js PlansScreen.js Shell.js   (one per screen as specs arrive)
  specs/
    auth/        signup signin signout google passkey reset verify sessions applock ratelimit
    shell/       navigation dock quick-actions sync-status pull-to-refresh welcome errors 404
    money/       transactions installments recurring income categories budgets import export ingest
    dashboard/   safe-to-spend checkin no-spend subscriptions assistant
    review/      review recap
    plans/ loans/ savings/ tasks/ notes/ groceries/ calendar/
    household/   invitations permissions members live-refresh delete-account
    offline/     transactions plans notes loans-goals idempotency sw-update
    security/    csrf isolation xss headers payloads
    cross/       layout-phone layout-tablet rtl a11y visual
```

Tags (in test titles): `@smoke` (≤ 15 tests, < 2 min, also run against previews), `@critical` (PR gate),
`@offline`, `@multiuser`, `@a11y`, `@visual`, `@slow`, `@quarantine`.

---

## 2. Page-by-page feature mapping

Legend — **Perm**: permission the route needs (`src/lib/pageAccess.js`; redirect to the first allowed page of
Dashboard → Notes → Settings, or "no access" text). States every page must be checked in: *loading
(skeleton)*, *empty*, *populated*, *offline (from cache)*, *server error*, *view-only member*, *RTL*.

### 2.1 Public routes

| Route | Elements to validate | States | Transitions |
| --- | --- | --- | --- |
| `/login` (SummitLogin) | Language radio (he / en / ru, default from device, saved in localStorage); email field (+ passkey autofill); Continue; password with show/hide and Caps Lock hint; Sign In; Forgot password?; Create an account → email → Full Name → password (strength meter) → Create Account; Back / Change; Sign in with a passkey; Continue with Google; Terms / Privacy links | Default; validation errors (`authEmailRequired`, `authInvalidEmail`, `authPasswordRequired`, `authPasswordShort`); busy; 429 `authTooManyAttempts`; reset link sent; `?reason=session_replaced / session_expired / account_deleted` toasts; passkeys unsupported (button hidden); Google not configured (button hidden) | → `redirect` param target (same-origin paths only, public pages → `/Dashboard`); greeting overlay then route change; already signed in → redirect away |
| `/reset-password/:token` | New password, Save and sign in, Back to sign in | Valid token; invalid/expired ("This link is invalid or has expired"); short password; server error | → signed in at `/Dashboard`, every other session ended |
| `/verify-email/:token` | Status text, Open Ascent | Confirming…; confirmed; invalid/expired | → `/Dashboard` or `/login` |
| `/accept-invitation/:token` | Inviter, workspace, role, Accept, Decline, Sign out, sign-in form / Google, "Continue with email and password" | Loading; signed out; signed in as invited email; signed in as **another** email (must sign out); expired (410); already used / declined / cancelled; invalid token (404); QR invite (no email) | Accept → workspace switched, "Welcome! You joined {workspace}"; Decline → "Invitation declined" |
| `/privacy-policy`, `/terms-of-service` | Content, back link, language | Signed in and signed out; each language | — |
| Any protected path while signed out | — | — | Full page load to `/login?redirect=<path>`; after sign-in returns to `<path>` |
| Unknown path while signed in | "Page not found", "Back to the dashboard" | — | → `/Dashboard` |

### 2.2 App shell (every signed-in page)

| Element | Desktop | Phone | States / transitions to validate |
| --- | --- | --- | --- |
| Sidebar (`AppSidebar`) | Nav: Dashboard, Monthly review, Expenses, Income, Plans, Loans, Savings, Notes, Groceries, Tasks; Calendar; workspace switcher; Dark Mode; Blur Values; user menu → Settings, Logout; collapse/expand (Ctrl/Cmd+B, ignored while typing; remembered) | — | Items hidden by permission; active item; collapsed tooltips; RTL side |
| Mobile dock (`MobileIsland`) | — | Dashboard, Expenses, **+**, Plans, Notes; Menu (aria-expanded) with the rest; Calendar | `+` adds to the page on screen; **long press** opens quick actions: Add expense, Add income, New plan, Add a loan, New goal, New note, New task (each permission-filtered) |
| Quick actions | Same list via sidebar buttons | Long-press menu | `?new=1` deep links open the create dialog on Plans, Commitments, Savings, Notes, Tasks |
| Sync status (`SyncStatus`) | Badge + panel | Same | All synced; Offline; Offline · n waiting; Syncing n…; n could not sync → per-item Try again / Throw away; Sync now |
| Pull to refresh | — | Pull gesture | Disabled while menu open; refetches |
| Welcome dialog | First visit | Same | "Let's Get Started!" closes and never returns |
| Install hint | — | iOS Safari not standalone | Install / Dismiss (remembered) |
| Invitations banner | Pending invites for me | Same | Accept / Decline |
| Account prompts | Unverified email banner (Send the link again); owner deleted account → Keep it / Leave it | Same | Claim race: "Someone else already kept this workspace" |
| Enable biometric prompt | After password/Google sign-in on a capable device | Same | Use {method} / Not now |
| App lock (`AppLock`) | "Ascent is locked", Unlock with {method}, Sign in another way | Same | Locks on fresh open, after background time, after 10 idle min; unlock offline |
| Idle sign-out | Warning 1 min before 10 min idle | Same | Deferred while outbox has unsynced changes; skipped when lock is on |
| Bottom sheets / dialogs | Centered dialog | Bottom sheet, swipe down closes (`useSheetDrag`) | Focus trap, Escape, focus return |
| Error boundary | "Something went wrong", Try again, Dashboard | Same | Per-page reset key |
| Toasts (sonner) | Top-right | Top, full-width | Success / error / undo actions |
| Calendar modal | From sidebar | From dock | §2.15 |

### 2.3 Dashboard (`/Dashboard`, `/`) — Perm `viewExpenses`
- **Elements**: month switcher (Previous month / Next month), Recap entry ("Your {month} recap is ready", Watch, Dismiss), Full review link, Safe to spend card (spent, income, already planned, safe to spend, ≈ per day, still to pay, month-end forecast with likely range, projected balance, coming up, budget pace list), Weekly check-in card (Start), No-spend card (opt-in "Turn on", streak, best, monthly goal), Subscriptions & repeating bills (Show all / Show less, "Price went up"), Loans & commitments card (Add a loan, View all), Tasks coming up (View all), Assistant bar ("Ask Ascent"), Net Amount, Savings Rate, Spending by category, Income vs expenses, Daily spending/Cumulative/Forecast chart, Recent transactions (View all).
- **States**: empty month ("No transactions this month"); no income/budgets hint; over budget ("Over by {amount}"); closed past month ("This month is closed: net result"); blur values on; assistant disabled/not configured/hidden.
- **Transitions**: View all → Expenses; Full review → Review for the same month; check-in sheet; recap stories; assistant "Ready to add" → transaction created.

### 2.4 Monthly review (`/Review`) — Perm `viewExpenses`
- **Elements**: month nav, Compare with (last month / same month last year / 3, 6, 12-month average), Spent/Earned/Kept/Overspent, Savings Rate, Highlights, The year around it (sparklines), Fixed and flexible, Pace through the month, Where it went (categories with budget %), Budgets kept, Places (New, Times), Day by day + no-spend days, Weekday rhythm, Biggest purchases, Income, Who paid, How it was paid, Year so far, "Watch {month} as a story".
- **States**: nothing recorded; current month ("So far, up to day {day}"); no history to compare; last year not on record; single member (no "Who paid").

### 2.5 Recap stories (from Dashboard / Review)
- **Elements**: full-screen stories, tap left/right, Play/Pause, Close, progress bars, Share the recap (image card), Watch again.
- **States**: month with data; nothing logged; overspent month; no-spend days present/absent; blurred values → share card shows **percentages only**.

### 2.6 Expenses (`/Expenses`) and Income (`/Income`) — Perm `viewExpenses` (writes need `editExpenses`)
- **Elements**: Add expense / Add income; period selector (months, Previous/Next year, All); totals (Total spent, Total Income, kept %, Left over / Overspent, Everyday vs Big purchases); Expenses by Category, by Payment Method; Income by source; search ("Search transactions..."), category filter, person filter (Everyone / Me / member), Needs review filter, Clear; transaction list (Today grouping, badges: Big purchase, Payment i of n, Possible duplicate, Needs review, Waiting to sync, Could not sync; row actions Confirm, Edit, Duplicate, Delete); Big purchases section; Coming up from your plans; Categories manager; Budgets manager.
- **Add/Edit Transaction dialog**: Type (Expense/Income), Amount, Currency (rate fetching / "No exchange rate right now"), Category (+ Suggested), Description (optional), Date, Time, Payment Method (None/Card/Cash/Transfer) → Select Card ("No cards available - Add in Settings"), Paid by (members), Big purchase toggle → Payments count (Fewer/More, One payment) with schedule preview, Repeats monthly → From/To date, Part of a plan, salary rule hint ("Saved on the last day of {month}"); edit of a series → "Apply changes to: All {count} monthly entries / This entry only".
- **States**: empty ("No transactions found"); filtered empty; offline ("Saved on this phone"); view-only (no add/edit/delete).

### 2.7 Plans (`/Plans`, detail in-page) — Perm `viewExpenses`
- **List**: New plan, template chips when empty (e.g. Vacation), upcoming plans, Done and archived.
- **Plan dialog**: What are you planning (kind), Name, Date, Ends, Budget, Currency, Notes, Start with suggested costs.
- **Detail**: All plans (back), More → Edit / Mark as done / Reopen / Archive / Unarchive / Delete plan; summary (Paid so far, Planned, Still to pay, Set aside monthly for n months, over-budget / unassigned budget notes); When the money goes out chart; Costs list (status Due / Overdue / Booked / Paid, Pay); Add cost dialog (What is it?, Amount, Due Date, Category, Status, Notes, Delete); Other spending on this plan; Notes.
- **States**: no plans; plan with no costs; overdue cost; paid via a recorded expense ("Delete that expense to reopen"); offline-created (local id → real id).

### 2.8 Loans & commitments (`/Commitments`) — Perm `viewExpenses`
- **List**: Add a loan, "Lent someone money?", What you owe / Owed to you, Installment purchases (from Expenses), empty state.
- **Loan dialog**: Who owes whom (I owe / Owed to me), Type, Name, Lender / Who borrowed it, Amount, Currency, current balance + next payment, How it's paid back (Monthly payments / Whenever), Interest a year, "I know" (monthly payment vs number of payments), Category in Expenses, Notes; validation "This payment doesn't cover the interest".
- **Detail**: Balance, % paid off, Monthly payment, Interest rate, Paid off in, Interest still ahead, Next payment, Record this month's payment, Extra payment, Pay it off faster (slider: Debt free sooner by, Interest saved), Repayments / They paid back, Payment schedule, More options → Edit, Mark as paid off / repaid, Reopen, Delete.
- **Payment dialog**: Amount, Date, Notes, "Also add to Expenses".

### 2.9 Savings (`/Savings`) — Perm `viewGoals` (writes `editGoals`)
- **List**: New goal, totals (Saved across your goals, this month, of targets), active goals, Reached and archived.
- **Goal dialog**: Name, Target (optional), Currency, By when (→ "That takes {amount} a month"), Already saved, Monthly plan, Notes.
- **Detail**: summary (Saved, Still to go, Per month to make it), At this pace, Add money / Take out, Growth chart, History, More → Edit / Mark as done / Reopen / Archive / Delete; "Goal reached" prompt.
- **Entry dialog**: Type (Add money / Take out), Amount, Date, Notes, Delete; "Only {amount} is saved in this goal".

### 2.10 Tasks (`/Tasks`) — open to every member (cost logging needs `editExpenses`)
- **Elements**: New task, Open: n, "The next 30 days will cost", late count, list with Mark {name} done, Done section, delete with undo, empty state.
- **Task dialog**: Start from (templates), What needs doing, Kind, Due, Repeats, Usual cost, Currency, Expense category, Who does it (Anyone / member), Show as due (On the day / n days before), Notes, Delete.
- **Done dialog**: Done on, It cost, Log it as an expense, Next time: {date}.

### 2.11 Notes (`/Notes`) — open to every member (server filters by note access)
- **Nav**: Notes, Shared, Reminders, Archive, Trash, Labels, Edit labels.
- **Toolbar**: Search notes (`/`), Filter notes (colour, label), Grid/List view, Refresh, Keyboard shortcuts (`?`), Empty trash.
- **Composer**: Take a note…, New checklist, New note with image, Title, Color, Labels, Show/Hide checkboxes, Close (Escape commits).
- **Card**: Pin/Unpin, select, More → Archive, Share, Copy as text, Make a copy, Move to trash, Leave note, Restore, Delete forever; "From {name}", "View only", "Edited by…".
- **Editor**: title/body, checklist editor (Enter adds, Backspace on empty removes, drag to reorder, completed group, Uncheck all, Delete checked items), suggestions, Reminder (date/time, Repeat), Attach file (Uploading…, Remove), dictation (Listening…), Undo/Redo (Ctrl+Z / Ctrl+Y), Ctrl+Enter close, Shift+8 toggle checklist, save status (Saving… / Saved / Offline — saved on this device), view-only banner, trash banner.
- **Share dialog**: Everyone in the workspace, per person Can edit / Can view / No access, Invite pending, owner-only changes, Copy as text, Share via….
- **Selection bar**: n selected, Select all, bulk Pin, Color, Labels, Archive, Make a copy, Move to trash, Restore, Delete forever.
- **States**: each nav section's empty state; offline with n to sync; loading.

### 2.12 Groceries (`/Groceries`) — open to every member
- **Views**: List (to buy, running low), Wall (tiles: tap = bought, hold = details/fill level), Kitchen check (Is {name} running out? Out / Low / Have it), Prices (list cost estimate, cheapest shop, shops compared, prices that moved, month by month).
- **Add bar**: "Add: milk, 2 eggs, bread…" (multi-item parse), Bought before suggestions, Add "{name}".
- **Item sheet**: Name, Emoji, How many, Note, Aisle, How much is left, Usually lasts, Track how long it lasts, Price history (Cheapest, "Usually {amount} less at {store}"), Put on / Take off the list, Delete item.
- **Shopping mode**: Which shop?, tick items into the cart, cart ≈ total, live "{name} got the {item}", Close shopping, Done · n bought.
- **Finish trip**: Scan the receipt (photo → AI read: Total, Store, Date), Save expense, Try another photo, Skip; AI off → "an owner can turn on the AI assistant".
- **States**: empty starter ("Start with what you buy every week"), "Shared with {names}", nothing low.

### 2.13 Settings (`/Settings`) — sections gate themselves
- **Shell**: section nav following scroll, Search settings (`/`, Escape clears, "No settings match your search"), Save/Cancel bar.
- **Profile**: Full Name, Email (read-only).
- **Appearance**: Theme (Midnight Indigo, OLED Black & Gold, Graphite & Champagne, Charcoal & Ivory, Burgundy & Gold, Slate & Sky, Indigo & Champagne, Light, Dark), Language, Default Currency, Blur Values, No-spend days + Monthly aim.
- **Notifications**: Daily Summary, Weekly Summary, Email Notifications, Notify me about new payments (push: Turn on / Send a test / Turn off; blocked / unsupported / not configured states).
- **Household**: Workspace Name (owner only), Members (online now, roles, Invite member, Change access, Resend, Show QR code, Copy invite link, Cancel invitation, Remove, Leave workspace, Open my own workspace), AI assistant toggle and Large expense alerts (owner/admin; "Not available on this server yet").
- **Cards**: Add Card (Card Name, Last 4 Digits, Credit/Debit, Name in Apple Wallet), Default, Edit, Delete.
- **Apple Pay & SMS capture**: Devices (Add device → key shown once, Copy; up to 5), Address, Card SMS alerts address, Recent activity, Turn off.
- **Security**: Lock with {method} + Lock when away for (At once / n min), Passkeys (Add, Rename, Remove, synced badge, last used).
- **Your data**: Import a card statement (dialog), Export Data (Expenses CSV, Notes CSV).
- **Account**: Sign out other devices, Logout, Delete account (type email to confirm).

### 2.14 Statement import dialog
Choose file (Excel/CSV, read on the device) → Sheet → Which column is which (date, amount, description…) →
Dates are written as → Charges are negative numbers → Put them in the review list → Preview ("{count} rows
ready", "{count} rows skipped", "Only the first {max} rows") → Import {count} → "Imported: {created} new,
{merged} matched, {duplicates} already there" → Import another file / Close.

### 2.15 Calendar modal
Not connected (Connect with Google); connected: Day/Week/Month, Today, Previous/Next, mini month, filters
(Events, Tasks, Holidays), agenda, New Event, Event composer (Title, Start, End, All day, Location,
Description, Color / Task title, Due Date, Notes, Mark as done), drag to move, drag bottom edge to resize,
Refresh, Disconnect Calendar; errors: session expired, Google unreachable, Sign-In unavailable.

---

## 3. Exhaustive scenario breakdown

Format: **ID · Scenario → Expected.** Priority: **P0** = PR gate, **P1** = merge to `main`, **P2** = nightly.
Existing tests are marked ✅ (keep), the rest are new.

### 3.1 Authentication & sessions

**Happy paths**

| ID | P | Scenario → Expected |
| --- | --- | --- |
| AUTH-H01 ✅ | P0 | Sign up (email → name → password) → lands off `/login`, welcome dialog, `ascent_session` cookie is `HttpOnly`, `SameSite=Strict`, `path=/api`; no token in `document.cookie` or `localStorage` |
| AUTH-H02 ✅ | P0 | Sign out from Settings → cookie removed, `/login` |
| AUTH-H03 ✅ | P0 | Sign in with password → app opens, cookie present |
| AUTH-H04 | P0 | Deep link while signed out (`/Plans`) → `/login?redirect=…` → after sign-in lands on `/Plans` |
| AUTH-H05 | P1 | Sign up in Hebrew (language radio) → `<html lang="he" dir="rtl">`, account `language: 'he'`, greeting in Hebrew |
| AUTH-H06 | P1 | Language choice on login page persists across reload (localStorage) and defaults from `navigator.language` (`locale: 'ru-RU'` → Russian) |
| AUTH-H07 | P1 | Google sign-in (fake GSI + tokeninfo stub) for a new email → account created, workspace exists, biometric offer flagged |
| AUTH-H08 | P1 | Google sign-in for an existing password account with the same email → signs into that account (no duplicate user) |
| AUTH-H09 ✅ | P0 | Add a passkey in Settings, sign out, "Sign in with a passkey" → signed in (Chromium) |
| AUTH-H10 | P1 | Passkey via email-field autofill (conditional mediation) → signed in without clicking the button |
| AUTH-H11 | P1 | Forgot password → "If there is an account for {email}…" → email arrives (sink) → `/reset-password/:token` → new password → signed in; old password refused; **other sessions ended** (second context gets 401 → `/login?reason=session_expired`) |
| AUTH-H12 | P1 | Verify email: banner "Confirm your email address" → Send the link again → link → "Your email is confirmed" → banner gone |
| AUTH-H13 | P1 | Two devices signed in at once (two contexts) → both work; sign out on one leaves the other signed in |
| AUTH-H14 | P1 | "Sign out other devices" → the other context's next request → `/login?reason=session_expired`… toast; this device stays in |
| AUTH-H15 ✅ | P1 | Face ID lock on → reopen → "Ascent is locked" → Unlock with one tap (options prefetched, no server wait on tap) |
| AUTH-H16 | P1 | Lock when away for "At once" / "5 min" → `visibilitychange` hidden for > n min → locked; < n min → not locked |
| AUTH-H17 | P2 | Unlock while offline (`setOffline(true)`) → "Offline: unlocking on this phone" → unlocked |
| AUTH-H18 | P1 | Passkeys: rename, remove → list updates; removed passkey can no longer sign in (`unknown_passkey` → "passkeyUnknown") |

**Negative**

| ID | P | Scenario → Expected |
| --- | --- | --- |
| AUTH-N01 ✅ | P0 | Wrong password → error shown, stays on `/login`, no cookie |
| AUTH-N02 | P0 | Empty email / malformed email (`a@b`, `a b@c.com`) → inline `authEmailRequired` / `authInvalidEmail`, no request sent |
| AUTH-N03 | P0 | Sign up with an existing email → "Email already registered" (409), no second account |
| AUTH-N04 | P1 | Password < 6 chars on sign-up / reset → `authPasswordShort`; > 128 chars → server 400 "Password must be 6 to 128 characters" surfaced |
| AUTH-N05 | P1 | **Account lockout**: 10 wrong passwords → 11th attempt (even correct) → 429 "Too many wrong passwords…"; Google / passkey / reset still work; `Retry-After` header present |
| AUTH-N06 | P1 | **IP limit**: from a fresh `X-Forwarded-For`, 41 sign-in attempts in 10 min → 429 → UI shows `authTooManyAttempts` |
| AUTH-N07 | P1 | Reset email limit: 6 "forgot" requests for one email in an hour → still the same neutral UI message, only 5 emails in the sink |
| AUTH-N08 | P1 | Forgot password for an unknown email → same neutral message (no account enumeration), no email |
| AUTH-N09 | P1 | Reset link reused after success / tampered token / expired → "This link is invalid or has expired" |
| AUTH-N10 | P1 | Verify link invalid → "This confirmation link is invalid or has expired." |
| AUTH-N11 | P1 | Google: popup closed (`select_by: 'user'`, no credential) → `authSignInCancelled`; token with wrong `aud` → error toast, no session; GSI script blocked → `authGoogleUnavailable` |
| AUTH-N12 | P1 | Passkey prompt cancelled (`NotAllowedError`) → "Cancelled" toast, no navigation |
| AUTH-N13 | P1 | Adding a second passkey on the same authenticator → "This device already has a passkey for your account" |
| AUTH-N14 | P2 | Passkey limit reached → `passkey_limit` 409 → "This account already has the most passkeys it can hold" |
| AUTH-N15 | P1 | `?redirect=https://evil.example/x` and `?redirect=//evil.example` → lands on `/Dashboard` (open-redirect guard in `toAppPath`) |
| AUTH-N16 | P1 | Visiting `/login` while signed in → redirected into the app |

**Edge cases**

| ID | P | Scenario → Expected |
| --- | --- | --- |
| AUTH-E01 | P1 | **Session replaced**: 11 sign-ins for one user (`MAX_SESSIONS = 10`) → the oldest context's next call → 401 `SESSION_REPLACED` → `/login?reason=session_replaced` toast "sessionReplaced" |
| AUTH-E02 | P1 | **Expired JWT**: cookie with a token signed with `expiresIn: -1` → 401 `SESSION_INVALID` → `/login?reason=session_expired`; cached data cleared from IndexedDB |
| AUTH-E03 | P1 | Tampered cookie (one byte changed) → treated as signed out, no crash |
| AUTH-E04 | P1 | **Idle sign-out**: `page.clock` → 9 min idle → warning; activity resets; 10 min → signed out |
| AUTH-E05 | P1 | Idle sign-out **deferred while unsynced**: offline expense in outbox → 10 min idle → still signed in until synced |
| AUTH-E06 | P1 | Idle sign-out disabled when Face ID lock is on → locks instead |
| AUTH-E07 | P2 | Sign-in in two tabs of the same context simultaneously → one session cookie, both tabs work |
| AUTH-E08 | P2 | Email with uppercase / surrounding spaces (`  Dana@E2E.test `) → signs into the lowercase account |
| AUTH-E09 | P2 | Unicode name (Hebrew, Cyrillic, emoji, 100 chars) → saved and shown; 101 chars → refused |
| AUTH-E10 | P2 | Network drop between "Create Account" click and response (route aborts once) → error, retry succeeds, exactly one account |
| AUTH-E11 | P2 | Double-click "Sign In" → one request (button busy) |
| AUTH-E12 | P2 | Lock: first automatic unlock attempt fails (user not verified) → button enabled, second tap works ✅ (covered in AUTH-H15) |
| AUTH-E13 | P2 | `?reason=account_deleted` → success toast `delDone` |

### 3.2 Account & preferences

| ID | P | Type | Scenario → Expected |
| --- | --- | --- | --- |
| ACC-H01 | P0 | Happy | Change Full Name → Saved toast → name in sidebar and on the other member's screen (Who paid) |
| ACC-H02 | P0 | Happy | Switch language en → he → ru → UI, `lang`/`dir` follow immediately, persists after reload and on another device (server pref) |
| ACC-H03 | P1 | Happy | Default currency ILS → USD → totals re-render in USD using stub rates |
| ACC-H04 | P1 | Happy | Theme: each of the 9 themes applies instantly, survives reload, `prefers-color-scheme` no longer overrides |
| ACC-H05 | P1 | Happy | Blur Values (sidebar and Settings) → every money figure blurred on Dashboard/Expenses/Review; recap share card shows only percentages |
| ACC-H06 | P1 | Happy | No-spend days on + monthly aim 10 → Dashboard card appears with "{n} of 10" |
| ACC-H07 | P1 | Happy | Settings search "/" focuses; "pass" filters to Passkeys; Escape clears; "zzz" → "No settings match your search" |
| ACC-H08 | P1 | Happy | Delete account (sole workspace) → type email → "Delete forever" → `/login?reason=account_deleted`; sign-in with that email fails; data gone (direct DB check) |
| ACC-N01 | P1 | Negative | Delete account with the wrong email typed → button disabled / 400 "Type your email to confirm" |
| ACC-N02 | P1 | Negative | `PUT /api/auth/me` with `currency: 'usd'` / `noSpendTarget: 32` / `theme: 'pink'` → 400 `Invalid value for …`; UI unchanged |
| ACC-N03 | P1 | Negative | Save fails (route → 500) → "Could not save your settings. Please try again." and the control reverts |
| ACC-E01 | P1 | Edge | Owner of a shared workspace deletes their account → remaining members see "{name} deleted their account" → first **Keep it** becomes owner; a second member clicking Keep it → "Someone else already kept this workspace" |
| ACC-E02 | P2 | Edge | All remaining members click **Leave it** → workspace and its data deleted (DB check) |
| ACC-E03 | P2 | Edge | Email field is read-only ("Email cannot be changed"); editing via devtools + PUT ignores `email` |

### 3.3 Workspace, invitations & members

**Happy**

| ID | P | Scenario → Expected |
| --- | --- | --- |
| WS-H01 | P0 | Owner invites partner by email as editor → "Invitation sent", email in sink → partner (new account) opens link → signs up with that email → Accept → "Welcome! You joined {workspace}" → both see the same expenses |
| WS-H02 | P1 | Existing user invited → **Invitations banner** in their app → Accept → workspace switcher lists both workspaces |
| WS-H03 | P1 | QR invite: Create QR code → Copy invite link → another signed-in user opens it → joins; link works once |
| WS-H04 | P1 | Resend invitation → second email; Cancel invitation → link now "invalid or has already been used" |
| WS-H05 | P1 | Change access editor → viewer → partner's open app loses Add buttons within one pulse (≤ 4 s + refetch) |
| WS-H06 | P1 | Custom permissions: Expenses = View, Notes = Edit, Goals = None → Savings hidden from nav, `/Savings` redirects to Dashboard; notes editable |
| WS-H07 | P1 | Remove member → their open app: next request fails → moved to their own workspace / no-access, data no longer visible |
| WS-H08 | P1 | Member leaves workspace → "You left the workspace" → switched to their own |
| WS-H09 | P1 | Rename workspace (owner) → name updates in both apps' switchers |
| WS-H10 | P0 | **Live refresh**: partner adds an expense → owner's open Expenses page shows it within 10 s without reload (pulse `dataRev`) |
| WS-H11 | P1 | Presence: "Active now" / "{n} online now" while the partner's app is open; "Seen {time} ago" after it closes (heartbeat) |
| WS-H12 | P1 | Switch workspace → every list refetches for the new `x-workspace-id`; nothing from the previous workspace remains on screen or in cache |

**Negative**

| ID | P | Scenario → Expected |
| --- | --- | --- |
| WS-N01 | P1 | Invite invalid email → "Enter a valid email address" |
| WS-N02 | P1 | Invite someone already a member / already invited → 409 "This person is already a member" / "…has already been invited" |
| WS-N03 | P1 | Invite yourself → "You are already in this workspace" |
| WS-N04 | P1 | Signed in as a different email than invited → "This invitation was sent to {email}. Sign out and continue…" → Accept refused |
| WS-N05 | P1 | Expired invitation → "This invitation has expired. Ask for a new one." (410) |
| WS-N06 | P1 | Already accepted / declined → "Invitation has already been accepted/declined" |
| WS-N07 | P1 | Admin tries to assign **admin** → option absent; forced via API → 403 "You cannot assign this role" |
| WS-N08 | P1 | Admin tries to change/remove the owner or another admin → actions absent; API → 403 "You cannot change this member" |
| WS-N09 | P1 | Editor/viewer opens Members → "Only the owner and admins can change who has access."; API invite → 403 |
| WS-N10 | P1 | Owner clicks Leave → absent; API → 400 "The owner cannot leave. Delete the workspace instead." |
| WS-N11 | P1 | Non-owner renames workspace via API → 403 "Only the owner can rename the workspace" |
| WS-N12 | P2 | 21st member → 400 "A workspace can have up to 20 members" |
| WS-N13 | P1 | SMTP sink down → "Invite created, but the email could not be sent. Copy the link…" and the link works |

**Edge**

| ID | P | Scenario → Expected |
| --- | --- | --- |
| WS-E01 | P1 | Two admins change the same member's role at once → last write wins, both UIs converge after pulse, no 500 |
| WS-E02 | P2 | Accept an invitation offline → clear error, accept later works |
| WS-E03 | P2 | Invitation accepted in one tab while the banner is open in another → banner disappears / Accept → "no longer pending" handled |
| WS-E04 | P2 | Removed member had queued offline writes → on reconnect they are refused (403) → shown as "could not sync" with Throw away |
| WS-E05 | P2 | Workspace with `ownerLeft` and only one member → "Keep it" makes them owner immediately |

### 3.4 Permission matrix (UI hidden **and** API enforced)

Run as a data-driven spec: for each role × area, assert (a) the UI control's presence, (b) the direct API call result.

| Area / action | Owner | Admin | Editor | Viewer | Custom "none" | API on violation |
| --- | --- | --- | --- | --- | --- | --- |
| View Dashboard/Review/Expenses/Income/Plans/Loans | ✓ | ✓ | ✓ | ✓ | redirect → Notes/Settings | `GET` → 403 |
| Add/edit/delete transaction, plan, loan, card | ✓ | ✓ | ✓ | hidden | hidden | 403 "You do not have permission for this action" |
| Budgets view / edit | ✓ | ✓ | ✓ | view only | hidden | 403 |
| Savings view / edit (`viewGoals`/`editGoals`) | ✓ | ✓ | ✓ | view only | nav hidden, `/Savings` redirect | 403 |
| Notes create (`editNotes`) | ✓ | ✓ | ✓ | hidden | hidden | 403 "You do not have permission to create notes" |
| Note shared "Can view" | — | — | — | — | — | edit → 403 "You can only view this note" |
| Groceries, Tasks (tick off) | ✓ | ✓ | ✓ | ✓ | ✓ | — (open to all members) |
| Task "Log it as an expense" | ✓ | ✓ | ✓ | hidden/disabled | hidden | expense write → 403 |
| Cards (`manageCards`) | ✓ | ✓ | hidden | hidden | hidden | 403 |
| Members (`manageUsers`) | ✓ | ✓ (not admins/owner) | read-only | read-only | read-only | 403 |
| Household AI / large-expense alerts | ✓ | ✓ | read-only "Only the owner or an admin can change this." | same | same | 403 |
| No permission anywhere | — | — | — | — | "noAccessAnyPage" text | — |

Plus cross-workspace isolation (§3.20 SEC-N04/N05).

### 3.5 Transactions (Expenses & Income)

**Happy**

| ID | P | Scenario → Expected |
| --- | --- | --- |
| TX-H01 | P0 | Add expense (amount, category, description, today) → toast, row under "Today", Dashboard spent and category chart include it; server has it |
| TX-H02 | P0 | Add income → appears on Income page; Dashboard "Income" and Savings Rate update |
| TX-H03 | P0 | Edit amount/category → row and totals update; server updated |
| TX-H04 | P0 | Delete → confirm dialog → row gone; totals updated |
| TX-H05 | P1 | Duplicate a row → new identical row dated today (or same date per design) opens for editing |
| TX-H06 | P1 | Category suggestion: description "Shufersal" → "Suggested" chip picks Groceries (merchant rules); accepting it saves that category |
| TX-H07 | P1 | Foreign currency: 100 USD for an ILS user → stored with conversion fields; totals show ≈ 370 ILS (stub rate 3.7) |
| TX-H08 | P1 | Payment method Card → choose card → row shows card; filter by payment method chart updates |
| TX-H09 | P1 | Paid by: partner selected → "Who paid" on Review and person filter "partner" show it |
| TX-H10 | P0 | **Big purchase**: 3,000 in 10 payments → "Add 10 payments" → 10 linked rows "Payment i of 10" monthly; Big purchases section "{paid} of 10 paid", Left to pay, Next payment; everyday spending excludes it |
| TX-H11 | P1 | Delete one installment → "Only this payment" vs "All 10 payments" both behave |
| TX-H12 | P1 | **Repeats monthly** from Jan to Jun → 6 entries; edit one with "This entry only" → only it changes; "All 6 monthly entries" → all change |
| TX-H13 | P1 | **Salary rule**: income in category Salary dated the 1st → saved on the last day of the previous month ("Salary for {month}") and counts toward it |
| TX-H14 | P1 | Link to a plan ("Part of a plan") → shows under the plan's "Other spending on this plan" |
| TX-H15 | P1 | Search "coffee", category filter, person filter "Me", Needs review filter, Clear → each narrows correctly; combined filters AND together |
| TX-H16 | P1 | Period selector: previous month, previous year, "All" → list and totals match seeded data |
| TX-H17 | P1 | Browse back past the 14-month default window → older rows load (`from` extended), no duplicates |
| TX-H18 | P1 | Needs review row (from Apple Pay ingest) → Confirm → badge removed |

**Negative**

| ID | P | Scenario → Expected |
| --- | --- | --- |
| TX-N01 | P0 | Amount empty / 0 / negative → "Amount must be greater than 0", no request |
| TX-N02 | P0 | No category → "Select a category" |
| TX-N03 | P1 | No date → "Date is required"; repeating with end before start → "End date must be after the start date" |
| TX-N04 | P1 | Card method with no cards → "No cards available - Add in Settings" |
| TX-N05 | P1 | Rates API down (stub 500) → "No exchange rate right now. The amount is saved in its own currency" → saved, totals exclude/flag it, no crash |
| TX-N06 | P1 | Server 500 on create (route) while **online** → error toast, dialog keeps values, nothing duplicated after retry |
| TX-N07 | P1 | Server 400 validation (amount `1e16`) → readable error, no row |
| TX-N08 | P1 | `paidBy` set to a non-member via API → 400 "Only members of this workspace can be named on a row" |
| TX-N09 | P1 | Viewer: no Add buttons, row menu without Edit/Delete; forced POST → 403 |
| TX-N10 | P1 | Delete an already-deleted row (deleted on partner's device) → handled (404 → row disappears), no error loop |

**Edge**

| ID | P | Scenario → Expected |
| --- | --- | --- |
| TX-E01 | P1 | Decimal precision: 0.1 + 0.2 → total 0.30; 19.999 → rounding per currency; Russian locale decimal comma `42,5` accepted or rejected clearly |
| TX-E02 | P1 | Max amount `999 999 999 999 999` (≤ 1e15) accepted; `1e15 + 1` refused; number formatting doesn't overflow the card at phone width |
| TX-E03 | P1 | Description 10,000 chars accepted; 10,001 refused; emoji/RTL/Cyrillic mixed text displayed without layout break |
| TX-E04 | P1 | **Month boundary**: expense at 23:30 on the last day in `Asia/Jerusalem` → appears in that month (not next) in both Jerusalem and LA contexts per the stored local day |
| TX-E05 | P2 | DST change day, Feb 29, Dec 31 → Jan 1 rollover in recurring series and installments |
| TX-E06 | P1 | Double-click "Add Transaction" → exactly one row (button busy + `app:` dedupe key) |
| TX-E07 | P1 | **Concurrent edit**: owner and partner edit the same row → last save wins, both converge after pulse, no 500 |
| TX-E08 | P2 | 5,000 rows (`big-data`) → Expenses usable: first render < 2 s, scrolling smooth, search responds < 300 ms |
| TX-E09 | P2 | Network drop mid-save (route aborts the POST after the server received it) → retry uses the same dedupe key → one row |
| TX-E10 | P2 | Installments: 1 payment ("One payment"), 60 payments; amount not divisible (100 / 3) → payments sum exactly to the total |
| TX-E11 | P2 | Change a transaction's type expense → income → moves between pages and totals |

### 3.6 Categories & budgets

| ID | P | Type | Scenario → Expected |
| --- | --- | --- | --- |
| CAT-H01 | P0 | Happy | Add category "Gifts" (Expense) → available in the transaction dialog |
| CAT-H02 | P1 | Happy | Delete a category → "Category deleted successfully!"; existing rows keep a sensible fallback |
| CAT-H03 | P1 | Happy | New account has localized default categories (Hebrew names for a Hebrew user) |
| BUD-H01 | P0 | Happy | Add budget Food 2,000 / month, warn at 80% → Dashboard budget pace shows "{spent} of 2,000" |
| BUD-H02 | P1 | Happy | Spend 1,700 → near-limit warning; 2,100 → "Over budget by 100" (calm styling, no alarm red per principles) |
| BUD-H03 | P1 | Happy | "On pace to pass its budget around {date}" appears when daily pace projects past limit |
| BUD-H04 | P1 | Happy | Edit and delete budget; Share with household toggle → visible/hidden to partner |
| CAT-N01 | P1 | Negative | Empty name → "Category name is required"; duplicate (case-insensitive) → "Category already exists" |
| BUD-N01 | P1 | Negative | Every category budgeted → "All categories have budgets" state, Add disabled |
| BUD-N02 | P1 | Negative | Limit 0 / negative / non-numeric → validation error |
| CAT-E01 | P2 | Edge | Category name 1 char, 100 chars, emoji only, RTL |
| BUD-E01 | P2 | Edge | Budget for a past month / specific year-month only applies there |
| BUD-E02 | P2 | Edge | Foreign-currency expenses count toward an ILS budget at converted value |

### 3.7 Dashboard insights

| ID | P | Type | Scenario → Expected |
| --- | --- | --- | --- |
| DSH-H01 | P0 | Happy | `typical-month` → Safe to spend = budgets/income − spent − already planned; "≈ {amount} a day for {days} days" uses days left |
| DSH-H02 | P1 | Happy | Month-end forecast "about {amount}" with "likely {low}–{high}" visible after ≥ 7 days of data |
| DSH-H03 | P1 | Happy | Previous/next month navigation; past month shows "This month is closed: net result" |
| DSH-H04 | P1 | Happy | Subscriptions card detects monthly repeats from `history-14m`; "Price went up · up from {from}" for the raised one; Show all {count} / Show less |
| DSH-H05 | P1 | Happy | Loans card summarises what you owe / owed to you; empty → "Add a loan" deep-links the dialog |
| DSH-H06 | P1 | Happy | Tasks coming up lists tasks due within the window; View all → `/Tasks` |
| DSH-H07 | P1 | Happy | No-spend: opt in ("Turn on") → streak counts days without purchases; recurring bills don't break it ("Bills that run by themselves do not count"); buying today → "Something was bought today; the run counts up to yesterday" |
| CHK-H01 | P0 | Happy | Weekly check-in: "Payments to look at: n" → Start → each needs-review payment: Looks right / pick category / Edit / Delete / Leave as is → "Payments sorted out: n" → week in numbers (Most on, Biggest, No-spend days, Coming in the next 7 days) → "Done for this week" |
| CHK-H02 | P1 | Happy | Possible duplicate in check-in: "This looks like a payment that is already recorded" → Delete this copy → only one remains; Keep both → both remain, flag cleared |
| CHK-H03 | P1 | Happy | Nothing to review → "All clear. This week:" → straight to numbers |
| DSH-N01 | P1 | Negative | No income and no budgets → hint "Add this month's income or set budgets to see what is safe to spend" instead of a misleading number |
| DSH-N02 | P1 | Negative | `/api/entities/transactions` 500 (route) → page shows error state / Try again, other cards still render (no blank page) |
| CHK-N01 | P2 | Negative | Delete in check-in fails (500) → "Failed to delete transaction", item stays |
| DSH-E01 | P1 | Edge | First day of month (clock) → no division by zero in per-day figures; last day → "for 1 day" |
| DSH-E02 | P2 | Edge | Overspent: "Over by {amount}"; projected balance negative formatted correctly in RTL (minus sign position) |
| DSH-E03 | P2 | Edge | Only foreign-currency data + rates down → cards degrade gracefully |
| CHK-E01 | P2 | Edge | Partner resolves the same review item meanwhile → sheet skips it on next step, no error |

### 3.8 AI assistant (stubbed Anthropic)

| ID | P | Type | Scenario → Expected |
| --- | --- | --- | --- |
| AI-H01 | P1 | Happy | Owner turns AI on in Household → Dashboard shows "Ask Ascent" |
| AI-H02 | P1 | Happy | "coffee 18 with Max" → "Ready to add" card (amount 18, category, description) → Add → transaction exists |
| AI-H03 | P1 | Happy | "Edit first" opens the transaction dialog prefilled |
| AI-H04 | P1 | Happy | Question "how much on food vs last month" → answer text, disclaimer "Answers come from Claude by Anthropic…" |
| AI-H05 | P1 | Happy | Category suggestion via AI when merchant rules don't know the merchant |
| AI-H06 | P1 | Happy | Groceries Finish trip: receipt photo (`setInputFiles`) → Total/Store/Date read → Save expense → items priced "{n} of {total} items priced" |
| AI-N01 | P1 | Negative | AI off → bar hidden; forced `POST /api/assist` → 403 `ai_disabled` |
| AI-N02 | P1 | Negative | Server without `ANTHROPIC_API_KEY` → Settings "Not available on this server yet"; toggle disabled; API 503 `ai_not_configured` |
| AI-N03 | P1 | Negative | Editor/viewer sees the toggle read-only |
| AI-N04 | P1 | Negative | Model refuses → 422 `ai_declined` → friendly message |
| AI-N05 | P2 | Negative | 41st call in an hour → 429 `rate_limited` → message, bar usable later |
| AI-N06 | P2 | Negative | Receipt not readable → "That photo could not be read as a receipt…" → Try another photo / enter amount manually |
| AI-E01 | P2 | Edge | Upstream timeout / 529 → message within the 60 s function limit, no stuck spinner |
| AI-E02 | P2 | Edge | Receipt image > 4 MB base64 → 400 `image_required`, UI explains |
| AI-E03 | P2 | Edge | Prompt-injection text in a transaction description ("ignore previous instructions…") doesn't change behaviour (assistant only sees aggregates) |

### 3.9 Monthly review & recap

| ID | P | Type | Scenario → Expected |
| --- | --- | --- | --- |
| RV-H01 | P1 | Happy | `history-14m` → Spent/Earned/Kept and categories match seeded sums for that month |
| RV-H02 | P1 | Happy | Compare with: last month → same month last year → 3/6/12-month average → deltas and "was {amount}" update |
| RV-H03 | P1 | Happy | Current month → "So far, up to day {day} — compared with the same days before" |
| RV-H04 | P1 | Happy | Places: a merchant first seen this month marked "New"; Weekday rhythm "most on {day}"; Who paid split by member |
| RV-H05 | P1 | Happy | "Watch {month} as a story" opens recap |
| RC-H01 | P1 | Happy | Recap entry at month start → Watch → stories auto-advance; tap right/left; Pause/Play; Close (Escape) |
| RC-H02 | P1 | Happy | Share the recap → image generated (Web Share stub or download) with the month's figures |
| RV-N01 | P1 | Negative | Empty month → "Nothing recorded this month" with guidance |
| RV-N02 | P2 | Negative | No history → "Nothing recorded before this month yet…"; YoY absent → "Last year is not fully on record…" |
| RC-E01 | P1 | Edge | Blur values on → share card shows **percentages only**, no absolute amounts (inspect generated image text layer / canvas data via test hook) |
| RC-E02 | P2 | Edge | Overspent month → "You spent more than came in, by…" story; zero no-spend days → "Every day had something…" |
| RC-E03 | P2 | Edge | `reducedMotion: 'reduce'` → stories don't auto-animate; still navigable |
| RC-E04 | P2 | Edge | Dismiss recap → doesn't return this month; returns next month |

### 3.10 Plans

| ID | P | Type | Scenario → Expected |
| --- | --- | --- | --- |
| PL-H01 | P0 | Happy | Empty Plans → "Vacation" template → Name, Date, Budget → Create plan → detail opens with suggested costs dated before the trip |
| PL-H02 | P0 | Happy | Add cost (Flights 900, due date) → Planned / Still to pay / Set aside monthly update |
| PL-H03 | P1 | Happy | Mark a cost Booked; "Pay" → records an expense linked to the plan → cost "Paid"; Paid so far up |
| PL-H04 | P1 | Happy | Remove a cost → "Cost removed" → Undo restores it |
| PL-H05 | P1 | Happy | Mark as done → moves to "Done and archived"; Reopen; Archive/Unarchive; Delete plan → confirm (expenses kept) |
| PL-H06 | P1 | Happy | Quick action "New plan" / `/Plans?new=1` opens the dialog |
| PL-H07 | P1 | Happy | Plan costs appear on Expenses "Coming up from your plans" and Dashboard "Already planned for this month" |
| PL-N01 | P1 | Negative | No name → "Give your plan a name"; Ends before Date → "End date must be after the start date" |
| PL-N02 | P1 | Negative | Save fails online (500) → "Could not save the plan", dialog keeps input |
| PL-N03 | P1 | Negative | Paid cost can't be edited back to due ("Delete that expense to reopen it") |
| PL-E01 | P1 | Edge | Costs over budget → "Costs are {amount} over the budget"; under → "{amount} of the budget is not assigned to a cost yet" |
| PL-E02 | P1 | Edge | Cost with past due date → "Overdue" |
| PL-E03 | P0 | Edge | **Concurrent list edits**: owner adds "Hotel" while partner adds "Car" (per-entry PATCH `?list=items`) → both survive ✅ (Vitest covers logic; E2E proves it over HTTP) |
| PL-E04 | P1 | Edge | ✅ Offline: plan + cost created offline → syncs, URL switches from `local:` id to real id |
| PL-E05 | P2 | Edge | Plan in another currency; plan with no date ("No date yet"); 200 costs |

### 3.11 Loans & commitments

| ID | P | Type | Scenario → Expected |
| --- | --- | --- | --- |
| LN-H01 | P0 | Happy | Add loan (I owe, 100,000 at 5%, monthly payment known) → summary "{payment} a month for {duration} · {interest} in interest"; detail shows balance, schedule, Paid off in |
| LN-H02 | P0 | Happy | Record this month's payment (Also add to Expenses) → balance down by the principal part; expense appears in its category; "This month's payment is recorded" |
| LN-H03 | P1 | Happy | Extra payment → balance down by the full amount; schedule shorter |
| LN-H04 | P1 | Happy | Pay it off faster slider → "Debt free sooner by" and "Interest saved" update; too small → "That's too small to change the end date" |
| LN-H05 | P1 | Happy | Owed to me, "Whenever" → Record a repayment → "Still owed to you" decreases; full → "Repaid in full" |
| LN-H06 | P1 | Happy | Mark as paid off → "Paid off. Well done!"; Reopen |
| LN-H07 | P1 | Happy | Delete loan → confirm; recorded expenses remain; payment remove → Undo |
| LN-H08 | P1 | Happy | Installment purchases from Expenses appear in "Installment purchases" with "{paid} of {count} paid" |
| LN-N01 | P1 | Negative | No amount → "Enter the amount"; no next payment date → "Choose the next payment date" |
| LN-N02 | P1 | Negative | Monthly payment below monthly interest → "This payment doesn't cover the interest, so the loan would never be paid off" — Save blocked |
| LN-N03 | P1 | Negative | Payment amount 0 → "Amount must be greater than 0" |
| LN-E01 | P2 | Edge | 0% interest ("No interest"); 30-year mortgage (360 rows in schedule renders fast) |
| LN-E02 | P2 | Edge | Already-paying loan: today's balance + next payment → schedule starts from now |
| LN-E03 | P2 | Edge | Two members record the same month's payment simultaneously (per-entry `?list=payments`) → both recorded or clearly deduplicated, never lost |

### 3.12 Savings goals

| ID | P | Type | Scenario → Expected |
| --- | --- | --- | --- |
| SV-H01 | P0 | Happy | New goal "Emergency fund" target 20,000 by 12 months → "That takes {amount} a month" |
| SV-H02 | P0 | Happy | Add money 2,000 → Saved, Still to go, Growth chart, totals "Saved across your goals" |
| SV-H03 | P1 | Happy | Take out 500 → Saved decreases; history shows both |
| SV-H04 | P1 | Happy | Reach the target → "Goal reached" → Mark as done → "Reached and archived" |
| SV-H05 | P1 | Happy | Open-ended goal (no target/date) → "Open-ended", "About {amount} a month lately" |
| SV-H06 | P1 | Happy | Edit entry; delete entry → Undo |
| SV-N01 | P1 | Negative | No name → "Give the goal a name"; amount 0 → "Amount must be greater than 0" |
| SV-N02 | P1 | Negative | Take out more than saved → "Only {amount} is saved in this goal" |
| SV-N03 | P1 | Negative | Member without `viewGoals` → Savings not in nav, `/Savings` → redirect |
| SV-E01 | P2 | Edge | Date in the past → monthly plan sensible (no negative months); "Already saved" > target |
| SV-E02 | P2 | Edge | Goal in USD for an ILS household → totals converted |

### 3.13 Tasks

| ID | P | Type | Scenario → Expected |
| --- | --- | --- | --- |
| TK-H01 | P0 | Happy | New task from template "Car insurance", due in 10 days, repeats yearly, cost 3,000, assignee partner → listed; "The next 30 days will cost" includes it |
| TK-H02 | P0 | Happy | Mark done → Done dialog (Done on, It cost 3,100, Log it as an expense ✓) → expense created in category; "Next time: {date}" one year later |
| TK-H03 | P1 | Happy | Task without cost → done in one tap, history entry recorded |
| TK-H04 | P1 | Happy | Delete → "Task deleted" + Undo; reopen a done task → "Task reopened" |
| TK-H05 | P1 | Happy | Show as due "7 days before" → appears on Dashboard "Tasks coming up" 7 days early |
| TK-H06 | P2 | Happy | Daily cron with push stub → reminder payload sent to the assignee only |
| TK-N01 | P1 | Negative | No title → "Give the task a title" |
| TK-N02 | P1 | Negative | Viewer ticks a task with a cost → can mark done, "Log it as an expense" hidden/disabled; forced → 403 |
| TK-N03 | P1 | Negative | Assignee not a member (API) → 400 |
| TK-E01 | P1 | Edge | Overdue → "{n} days late"; due today → "Today" |
| TK-E02 | P2 | Edge | Two members tick the same task at once → two history entries or one, never a 500 (history is per-entry) |
| TK-E03 | P2 | Edge | Monthly task due on the 31st → next is end of next month |

### 3.14 Notes

**Happy**

| ID | P | Scenario → Expected |
| --- | --- | --- |
| NT-H01 | P0 | Composer: title + body → Close → card appears; reload → persists |
| NT-H02 | P0 | New checklist → Enter adds items, tick → moves to "{n} completed", Backspace on empty removes, drag to reorder |
| NT-H03 | P1 | Pin → "Pinned" section; colour; labels (create "Home" inline → filter by label in nav) |
| NT-H04 | P1 | Archive → "Note archived" + Undo; Archive view lists it; Unarchive |
| NT-H05 | P1 | Move to trash → Trash view → Restore; Delete forever → confirm; Empty trash |
| NT-H06 | P1 | Multi-select (click select on 3 cards) → bulk colour, label, archive, trash; Select all; Escape clears |
| NT-H07 | P1 | Share with partner "Can edit" → partner sees it under Shared ("From {name}"), edits → owner sees "Edited by {name}" after pulse |
| NT-H08 | P1 | Share "Can view" → partner sees "View only", editor read-only ("You can read this note but not change it") |
| NT-H09 | P1 | Partner "Leave note" → gone from partner, still with owner |
| NT-H10 | P1 | Reminder: set for 1 min ahead (clock) → reminder notification/toast fires; appears under Reminders; Repeat daily |
| NT-H11 | P1 | Attach a PNG and a PDF → "Attachments", open, Remove |
| NT-H12 | P1 | Search, colour filter, label filter; Grid ↔ List view remembered |
| NT-H13 | P1 | Keyboard: `/` focuses search, `?` opens shortcuts, `#` label, Ctrl+Z / Ctrl+Y in editor, Ctrl+Enter closes, Shift+8 toggles checklist |
| NT-H14 | P1 | Copy as text → clipboard (`context.grantPermissions(['clipboard-read'])`) contains title + items; Make a copy |
| NT-H15 | P1 | Edit labels → rename "Home" → "House" on every note; delete label |
| NT-H16 | P2 | Dictation (mock `SpeechRecognition`) → text inserted; "Listening…" shown |

**Negative**

| ID | P | Scenario → Expected |
| --- | --- | --- |
| NT-N01 | P1 | Attachment 3 MB + 1 byte → "File is too large (max 3 MB)"; 11th file → "Up to 10 files per note"; empty file → "File is empty" |
| NT-N02 | P1 | Attach while offline → "Connect to the internet to add or open files" |
| NT-N03 | P1 | Non-owner tries to change sharing → "Only the owner can change who this note is shared with." |
| NT-N04 | P1 | Non-owner delete → 403 "Only the note owner can delete it" |
| NT-N05 | P1 | Microphone denied (`permissions` not granted) → "Microphone access is blocked…" |
| NT-N06 | P2 | Invalid reminder time (past via API) → 400 "Invalid reminder time" |
| NT-N07 | P1 | Viewer without `editNotes` → composer hidden; POST → 403 |

**Edge**

| ID | P | Scenario → Expected |
| --- | --- | --- |
| NT-E01 | P1 | **Concurrent edit conflict**: owner and partner edit the same note body → one gets 409 "The note changed meanwhile. Try again." handled without losing typed text; checklists merge per item (`checklistMerge`) |
| NT-E02 | P1 | Offline: create, edit, trash notes offline → "Offline — {n} to sync" → back online → all applied in order |
| NT-E03 | P2 | Note trashed 8 days ago (seeded) → purged (not listed, gone in DB); 6 days ago → still in Trash |
| NT-E04 | P2 | Limits: body 100,000 chars (truncated at limit, not crash), 500 checklist items, 30 labels |
| NT-E05 | P1 | **XSS**: title `<img src=x onerror=alert(1)>`, body with `<script>` → rendered as text; no dialog fired (`page.on('dialog')` fails test) |
| NT-E06 | P2 | 500 notes (`big-data`) → grid renders < 2 s; search responsive |
| NT-E07 | P2 | Undo after "Delete forever" not offered (permanent) |

### 3.15 Groceries

| ID | P | Type | Scenario → Expected |
| --- | --- | --- | --- |
| GR-H01 | P0 | Happy | Empty → starter chips (Milk, Eggs…) → tap three → on the list |
| GR-H02 | P0 | Happy | Add bar "milk, 2 eggs, bread" → "Add 3:" preview → three items, eggs ×2 |
| GR-H03 | P1 | Happy | Tap item → bought ("In the cart"/"Bought {when}"); Bought before suggestions on next add |
| GR-H04 | P1 | Happy | Wall view: tap tile = bought; **hold** tile → item sheet; set "How much is left" Low → appears in running low |
| GR-H05 | P1 | Happy | Kitchen check: Out / Low / Have it for each → "Kitchen checked", "Next to run out: {name}, {when}" |
| GR-H06 | P0 | Happy | Start shopping → Which shop? "Rami Levy" → tick items → cart ≈ total → Done → Finish trip → Skip or Save expense |
| GR-H07 | P1 | Happy | Item sheet: add price 7.90 at shop A and 6.50 at shop B → Cheapest B, "Usually 1.40 less at B"; Prices view "Your list will cost about"; Shops compared |
| GR-H08 | P1 | Happy | **Live shared shopping**: partner in shopping mode ticks milk → owner sees "{name} got the milk" |
| GR-H09 | P1 | Happy | Usually lasts (after 2 purchases) → "~{n} days left" estimates |
| GR-N01 | P1 | Negative | Empty add → nothing added; duplicate "milk" → "Already on the list" behaviour, no duplicate row |
| GR-N02 | P1 | Negative | Receipt scan with AI off → "an owner can turn on the AI assistant" → manual amount path works |
| GR-N03 | P2 | Negative | Finish trip "Enter the amount" when saving without total |
| GR-E01 | P2 | Edge | Both members tick the same item at once → bought once; purchase history per-entry (`?list=purchases`) keeps both trips |
| GR-E02 | P2 | Edge | Hebrew item names, emoji, 300 items; quantity parsing "2kg tomatoes", "תפוחים 3" |
| GR-E03 | P2 | Edge | Long-press vs scroll on touch: scrolling the wall doesn't trigger hold |

### 3.16 Calendar (Google, stubbed)

| ID | P | Type | Scenario → Expected |
| --- | --- | --- | --- |
| CAL-H01 | P1 | Happy | Not connected → Connect with Google (fake GSI code flow) → "Google Calendar connected!" → events from stub calendar in Week view |
| CAL-H02 | P1 | Happy | New Event (title, start, end, location, colour) → "Event created!" → visible; edit → "Event updated!"; delete → "Event deleted!" |
| CAL-H03 | P1 | Happy | New Task (title, due) → "Task created!"; Mark as done |
| CAL-H04 | P2 | Happy | Drag event to another slot → reschedule PATCH sent; drag bottom edge → duration changes |
| CAL-H05 | P1 | Happy | Day / Week / Month, Today, Previous/Next, filters Events/Tasks/Holidays, all-day toggle |
| CAL-H06 | P1 | Happy | Disconnect Calendar → "Calendar disconnected" → refresh token revoked (stub saw `/revoke`) |
| CAL-N01 | P1 | Negative | No title → "Event title is required" / "Task title is required" |
| CAL-N02 | P1 | Negative | Stub 401 → "Calendar session expired. Please reconnect."; 403 scope → permissions message; 5xx → "Something went wrong" |
| CAL-N03 | P2 | Negative | Google unreachable (route abort) → "Google could not be reached…"; GSI not loaded → "Google Sign-In is not available right now." |
| CAL-E01 | P2 | Edge | Event across midnight / DST; all-day multi-day; 50 events in one day ("{n} more") |
| CAL-E02 | P2 | Edge | Connection persists after sign-out/in (refresh token stored encrypted) |

### 3.17 Settings: cards, Apple Pay/SMS ingest, push, import, export

| ID | P | Type | Scenario → Expected |
| --- | --- | --- | --- |
| CRD-H01 | P1 | Happy | Add card (Visa, 4242, Credit) → "Card added"; Use as default → "Default card updated"; edit; delete |
| CRD-N01 | P1 | Negative | Missing fields → "Please fill in all fields"; last 4 = "42a1" / "123" → "Last 4 digits must be exactly 4 numbers" |
| ING-H01 | P0 | Happy | Apple Pay: Add device "My iPhone" → key shown **once** + Copy → `POST /api/ingest/wallet` with that key (Playwright `request`) → row in Expenses marked Needs review, card matched by last 4, category suggested; **open app updates via pulse**; Recent activity shows it |
| ING-H02 | P1 | Happy | SMS: forward a purchase text → parsed amount/merchant → row; declined charge / OTP / refund texts ignored |
| ING-H03 | P1 | Happy | Same purchase from wallet and SMS within the match window → one row (merged), not two |
| ING-H04 | P1 | Happy | Push on (permission granted) → ingest triggers push payload to this device (stub endpoint received it); "Send a test" → "Test sent" |
| ING-N01 | P1 | Negative | Wrong / revoked key → 401 "Invalid key"; "Turn off" device → its key stops working |
| ING-N02 | P1 | Negative | 6th device → "You can connect up to 5 devices. Remove one first." (409 `token_limit`) |
| ING-N03 | P1 | Negative | `GET /api/ingest/wallet` → 405; body > 8 KB → 413 `payload_too_large`; invalid JSON → 400 `invalid_json`; unknown kind → 404 |
| ING-N04 | P1 | Negative | Amount > 1,000,000 in SMS → ignored (`amount_out_of_range`), recorded in activity as refused |
| ING-N05 | P1 | Negative | Member who lost `editExpenses` → their key → 403 "This key can no longer add expenses to that workspace" |
| ING-N06 | P2 | Negative | 61 ingests in 10 min from one key/IP → 429 |
| ING-E01 | P2 | Edge | Same payload sent twice (Shortcut retry) → one row (dedupe key) |
| ING-E02 | P2 | Edge | Foreign-currency tap → converted with server rates; rates down → stored in its own currency |
| PSH-N01 | P1 | Negative | Permission denied (`context` without grant) → "Notifications are blocked…"; unsupported browser → "This browser cannot receive notifications."; server without VAPID → "Notifications are not set up on the server yet." (503) |
| IMP-H01 | P0 | Happy | Import CSV (fixture `e2e/fixtures/statement-isracard.csv`) → map columns → date format → Preview "{count} rows ready" → Import → "Imported: n new, m matched, k already there"; matched rows merged with existing manual entries |
| IMP-H02 | P1 | Happy | Import XLSX with multiple sheets → choose Sheet; charges-as-negative toggle; "Put them in the review list" → rows Needs review |
| IMP-H03 | P1 | Happy | Re-import the same file → all "already there", no duplicates |
| IMP-N01 | P1 | Negative | Not a spreadsheet (PNG renamed .csv) → "Could not read this file"; no date/amount columns → "No rows with a date and an amount were found" |
| IMP-N02 | P1 | Negative | 2,001 rows → "Only the first 2000 rows are imported at once…"; forced 2,001 via API → 413 `too_many_rows` |
| IMP-N03 | P2 | Negative | Server error on import → "Import failed", nothing partially written (DB check) |
| IMP-E01 | P2 | Edge | Hebrew headers, dd/mm/yyyy vs mm/dd/yyyy ambiguity, amounts "1,234.56" and "1.234,56", rows with zero amount skipped ("{count} rows skipped") |
| EXP-H01 | P1 | Happy | Export Expenses → `page.waitForEvent('download')` → CSV has every transaction (also outside the 14-month window), budgets, categories, cards; "{name}: {count} exported" |
| EXP-H02 | P1 | Happy | Export Notes → CSV with all notes and checklist items |
| EXP-E01 | P1 | Edge | **Formula injection**: description `=HYPERLINK("http://x")`, `+cmd`, `-1+1`, `@SUM` → neutralised (prefixed) in the CSV |
| EXP-E02 | P2 | Edge | Unicode (Hebrew/Russian) opens correctly in Excel (UTF-8 BOM present) |
| HH-H01 | P1 | Happy | Large expense alerts threshold 1,000 → partner adds 1,500 → owner receives push payload; 900 → none |

### 3.18 Offline & sync (service worker + outbox)

| ID | P | Type | Scenario → Expected |
| --- | --- | --- | --- |
| OFF-H01 ✅ | P0 | Happy | Expense added offline → visible, survives reload offline, reaches server once back online |
| OFF-H02 ✅ | P0 | Happy | Plan + cost offline → synced, real id |
| OFF-H03 | P0 | Happy | Cold start offline (fresh page load with `setOffline(true)` after one online visit) → app opens on cached data, Sync status "Offline" |
| OFF-H04 | P1 | Happy | Offline **edit** and **delete** of existing transactions → applied on reconnect in order (create → edit → delete of the same row ends deleted, no 404 noise) |
| OFF-H05 | P1 | Happy | Offline loan payment, savings deposit, task done, grocery tick → all sync (`listWrites`) |
| OFF-H06 | P1 | Happy | Sync status panel lists "New / Edited / Deleted" items; "Sync now" flushes immediately |
| OFF-N01 | P1 | Negative | Server refuses a queued item (e.g. permission revoked → 403) → "{count} could not sync" → Try again (still refused) → Throw away → removed, others synced |
| OFF-N02 | P1 | Negative | Offline sign-in attempt → clear "you are offline" error, no spinner forever |
| OFF-E01 | P0 | Edge | **Idempotency**: connection drops after the server stored the write but before the response (route: let request through, then abort response) → replay with same `app:` key → exactly one row |
| OFF-E02 | P1 | Edge | Flapping network (offline/online every 500 ms during sync of 20 items) → all 20 exactly once, in order |
| OFF-E03 | P1 | Edge | Two tabs of the same context offline add different expenses → both sync once |
| OFF-E04 | P1 | Edge | Partner deleted the row that was edited offline → conflict surfaces as could-not-sync, not a crash |
| OFF-E05 | P2 | Edge | Session expired while offline → on reconnect, outbox kept, user asked to sign in, items sync after sign-in (not discarded) |
| OFF-E06 | P2 | Edge | **New deploy / SW update**: build v1 open → serve v2 → app picks up new SW without breaking an open dialog; stale lazy chunk (`ChunkLoadError`) → recovers by reload, not a white screen |
| OFF-E07 | P2 | Edge | IndexedDB quota error / private mode (storage throws) → app still works online |

### 3.19 App shell & navigation

| ID | P | Type | Scenario → Expected |
| --- | --- | --- | --- |
| NAV-H01 | P0 | Happy | Desktop: every sidebar item navigates, active state set, page heading correct |
| NAV-H02 ✅ | P0 | Happy | Phone: Menu opens nav, links navigate, menu closes (`aria-expanded=false`) |
| NAV-H03 | — | Obsolete | (The phone dock was removed in 099dc1f.) Phone dock `+` on Expenses opens Add expense; on Plans opens New plan; on Notes opens composer |
| NAV-H04 | — | Obsolete | (The phone dock was removed in 099dc1f.) Long-press `+` (touch hold 600 ms) → quick-action menu; each item routes/opens correctly; viewer sees only allowed ones |
| NAV-H05 | P1 | Happy | Ctrl/Cmd+B collapses sidebar (tooltips on hover), remembered after reload; ignored while typing in an input |
| NAV-H06 | P1 | Happy | Bottom sheet swipe-down closes (touch drag); dialog Escape closes; focus returns to trigger |
| NAV-H07 | P1 | Happy | Pull to refresh on phone → refetch fired (network log) |
| NAV-H08 | P1 | Happy | Welcome dialog only on first visit; Install hint on iOS non-standalone only, Dismiss remembered |
| NAV-H09 | P1 | Happy | Browser back/forward across pages and open dialogs behaves (dialog closes on back where designed) |
| NAV-N01 | P1 | Negative | Unknown route → "Page not found" → Back to the dashboard |
| NAV-N02 | P1 | Negative | Page throws (route returns malformed JSON for a list) → Error boundary "Something went wrong" → Try again recovers when the route is fixed |
| NAV-N03 | P1 | Negative | Global 429 from API → "Too many requests. Please try again later." toast; app recovers |
| NAV-N04 | P1 | Negative | 503 "Database connection failed" → friendly error, retry works |
| NAV-E01 | P2 | Edge | Slow 3G (CDP throttling) → skeletons, no layout jump > CLS 0.1, no duplicate requests |
| NAV-E02 | P2 | Edge | Rapid navigation between 5 pages → no stale data from previous page, no unhandled promise rejections (console listener fails test on `pageerror`) |

### 3.20 Security (behavioural, through the browser and `request`)

| ID | P | Type | Scenario → Expected |
| --- | --- | --- | --- |
| SEC-H01 ✅ | P0 | Happy | Session cookie flags HttpOnly / SameSite=Strict / path=/api; nothing token-like in storage |
| SEC-N01 | P0 | Negative | **CSRF**: `POST /api/entities/transactions` with the victim's cookie and `Origin: https://evil.example` → 403 "Request from another site" |
| SEC-N02 | P1 | Negative | No cookie → 401 "No token provided" on every entity route (data-driven over the 12 entities) |
| SEC-N03 | P1 | Negative | Missing `x-workspace-id` → 400 "Workspace context required" |
| SEC-N04 | P0 | Negative | **Workspace isolation**: user B sends `x-workspace-id` of A's workspace → 404 "Workspace not found or access denied"; no data leaked |
| SEC-N05 | P0 | Negative | **IDOR**: user B `PUT/DELETE ?id=<A's transaction id>` in B's own workspace → 404, A's row unchanged |
| SEC-N06 | P1 | Negative | Body > 10 MB → 413 `payload_too_large`; malformed JSON → 400 `invalid_json` |
| SEC-N07 | P1 | Negative | Mass assignment: POST transaction with `created_by: <other user>`, `workspaceId: <other>` → server overrides (`created_by` = caller) |
| SEC-N08 | P1 | Negative | Cron routes without / with wrong `Authorization: Bearer` → 401; with `e2e-cron` → runs and summary email lands in the sink |
| SEC-N09 | P1 | Negative | Invalid ObjectId in `?id=` → 400 `invalid_id`, not 500 |
| SEC-E01 | P1 | Edge | XSS sweep: names, descriptions, plan/goal/task/note titles, workspace name, member name with payloads → no script execution anywhere they render (lists, toasts, emails in sink are escaped) |
| SEC-E02 | P2 | Edge | Preview deployment: CSP, HSTS, X-Frame-Options DENY, Permissions-Policy present (`vercel.json`); app works under CSP (no violations in console) |
| SEC-E03 | P2 | Edge | Clickjacking (preview deployment only; `vite preview` doesn't send `vercel.json` headers): app inside an `<iframe>` on another origin refuses to render |

### 3.21 Internationalisation & RTL flows

| ID | P | Type | Scenario → Expected |
| --- | --- | --- | --- |
| I18N-H01 | P1 | Happy | Core journey (add expense → dashboard → plan → note) in **Hebrew**: `dir=rtl`, sidebar on the right, dock order mirrored, back arrows flipped, numbers and currency read LTR inside RTL text |
| I18N-H02 | P1 | Happy | Same journey in Russian: long labels don't overflow buttons at 375 px |
| I18N-H03 | P1 | Happy | Switch language mid-session with a dialog open → text changes, layout direction flips, no remount data loss |
| I18N-H04 | P1 | Happy | Dates and months localised (date-fns locale), week starts per locale |
| I18N-E01 | P2 | Edge | Mixed-direction user data (Hebrew merchant + English note + numbers) renders with correct bidi isolation |
| I18N-E02 | P2 | Edge | Emails (invite, reset) sent in the recipient's language |
| I18N-E03 | P2 | Edge | Visual: no element contains a raw translation key (scan DOM text for `/^[a-z]+[A-Z][a-zA-Z]+$/` patterns) in all 3 languages |

### 3.22 Complete lifecycle journeys (end-to-end stories, `@critical`)

These string features together the way a real household does. Each is one test with `test.step`s.

| ID | Journey |
| --- | --- |
| J-01 | **New household**: sign up (UI) → welcome → set currency & language → add 2 cards → add budget → add 5 expenses + salary → Dashboard safe-to-spend correct → invite partner → partner signs up via email link → partner adds an expense → owner sees it live → owner signs out |
| J-02 | **Big purchase month**: buy a sofa in 12 payments → Big purchases card → Dashboard excludes it from everyday → Review shows it under Fixed → delete payment 12 only → schedule updates |
| J-03 | **Trip**: create Vacation plan → add costs → pay flights from the plan → expense appears in Expenses linked to plan → Dashboard "already planned" → mark plan done |
| J-04 | **Phone shopping trip** (phone project, offline mid-way): open Groceries → start shopping → go offline in the shop → tick 8 items → back online → finish trip → receipt → expense saved → prices learned |
| J-05 | **Weekly check-in after Apple Pay week**: 6 ingests via API (one duplicate of a manual entry) → Dashboard "Payments to look at: 6" → resolve all, delete the duplicate → "Done for this week" |
| J-06 | **Month close**: clock at day 1 of next month → recap ready → watch → share with blur → Review compares with last month |
| J-07 | **Account lifecycle**: sign up → add passkey → turn on Face ID lock → sign out others → reset password via email → delete account → cannot sign in |
| J-08 | **Shared notes household**: owner creates checklist, shares Can edit → partner ticks items offline → syncs → owner sees merged checklist |

---

## 4. Cross-functional & UI/UX E2E tests

### 4.1 Responsive design

**Projects** (in `playwright.config.js`):

| Project | Device | Why |
| --- | --- | --- |
| `desktop-chromium` | 1440×900 | Long review sessions on desktop |
| `laptop` | 1280×720 | Sidebar + content at the common laptop size |
| `tablet` | iPad (gen 7) 810×1080, portrait & landscape | Breakpoint between dock and sidebar |
| `phone` | iPhone 13 (390×844, touch, `isMobile`) | Main audience (exists) |
| `phone-small` | iPhone SE (375×667) | Tightest width; long Russian labels |
| `phone-android` | Pixel 7 | Chrome on Android |
| `phone-landscape` | iPhone 13 landscape | Sheets and dock in landscape |

**What every responsive test asserts** (helpers in `e2e/support/layout.js`, extending today's `offScreen()`):

1. **No horizontal overflow** on all 11 app pages + 6 public pages (adds Review, Savings, Groceries, Tasks — gap G7), and with each main dialog open.
2. **Correct chrome per breakpoint**: phone → dock visible, sidebar absent; ≥ breakpoint → sidebar, no dock. Toaster position follows (`mobileOffset`).
3. **Touch targets ≥ 44×44 px** for every visible interactive element on phone projects (product commitment):
   `[...document.querySelectorAll('button,a,[role=button],input,select,[role=switch]')].filter(visible).filter(r => r.width < 44 || r.height < 44)` → allow-list exceptions explicitly.
4. **Dialogs become bottom sheets** on phone; swipe down (touch drag ≥ 120 px) closes; content scrolls inside the sheet; the on-screen keyboard (simulated by shrinking `visualViewport` via `page.setViewportSize` height) doesn't hide the submit button.
5. **Safe areas**: with `env(safe-area-inset-*)` simulated through the `--safe-top` CSS var, dock and toasts aren't under the notch/home indicator.
6. **Charts** (ECharts/Recharts) resize on viewport change and orientation change without overflow.
7. **Long content**: 100-char names, 1,000,000,000.00 amounts, Russian labels at 375 px → truncate with ellipsis, never overlap.

### 4.2 Cross-browser compatibility

| Engine | Projects | Scope | Notes |
| --- | --- | --- | --- |
| Chromium | all | Full suite | Only engine with CDP: passkeys/Face ID (virtual authenticator), network throttling, `context.serviceWorkers()` |
| **WebKit** | `desktop-webkit`, `phone-webkit` (iPhone 13) | Full suite minus `@chromium-only` (WebAuthn virtual authenticator, CDP throttling) | Closest to iOS Safari, the primary audience: date inputs, `100dvh`, backdrop-filter, IndexedDB, bottom sheets, long-press |
| Firefox | `desktop-firefox` | `@critical` + layout + a11y | Desktop users; catches non-standard CSS/JS |
| Real iOS Safari (installed PWA) | BrowserStack/LambdaTest App Automate or manual checklist | Nightly/weekly: install to Home Screen, standalone launch, Face ID unlock, push, Share sheet, receipt camera | Playwright can't drive an installed iOS PWA; keep a 15-minute scripted manual checklist per release until a device cloud is wired |

Tag engine-specific tests (`@chromium-only`) and use `test.skip(({ browserName }) => browserName !== 'chromium', 'needs CDP WebAuthn')`
instead of silently dropping them.

### 4.3 Accessibility (a11y) during user flows

Target: **WCAG 2.2 AA** (product commitment). jsdom axe already checks markup; the browser layer adds what needs real rendering.

1. **Automated scan at every meaningful state** with `@axe-core/playwright`, rules `wcag2a, wcag2aa, wcag21aa, wcag22aa`, **colour-contrast on**:
   ```js
   // e2e/support/a11y.js
   export async function expectAccessible(page, name, { include, disable = [] } = {}) {
     const results = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa'])
       .include(include ?? 'body').disableRules(disable).analyze();
     await test.info().attach(`axe-${name}`, { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' });
     expect(results.violations.map(v => `${v.id}: ${v.nodes.length}`)).toEqual([]);
   }
   ```
   Called inside journeys after: page load (populated + empty), every dialog/sheet open, validation errors shown, toasts, check-in steps, recap story, locked screen, login steps.
2. **Theme matrix for contrast**: every page scanned in Light, Midnight Indigo (dark) and OLED Black & Gold; smoke scan for the other six themes on Dashboard + Expenses + a dialog.
3. **Keyboard-only journeys** (no mouse API): sign in; add expense (Tab order: Type → Amount → Currency → Category → … → Add); navigate sidebar; open/close dialog with Escape and **focus returns** to the trigger; Radix selects open with Enter/Space and arrow keys; notes shortcuts; skip to main content.
4. **Focus management**: focus trapped inside open dialogs/sheets; visible focus ring on every focusable element (computed `outline`/`box-shadow` not none); no focus on hidden/inert elements.
5. **Screen-reader semantics**: landmarks (`navigation` "Main navigation", `main`), headings hierarchy per page (one `h1`), form fields labelled (already implied by `getByLabel`), toasts in a live region, icon-only buttons have names (Menu, Calendar, Retry/Discard in Sync status), charts have text alternatives or a table.
6. **Motion**: `reducedMotion: 'reduce'` project for Dashboard, recap, splash/entry transition → no auto-playing animations; app fully usable.
7. **Zoom / reflow**: 320 px CSS width (400% zoom equivalent) and `deviceScaleFactor: 2` → no horizontal scroll, no clipped text (WCAG 1.4.10).
8. **Forced colors** (`forcedColors: 'active'`) → controls remain visible.
9. **RTL a11y**: `lang` and `dir` on `<html>` follow the language; Hebrew pages scanned too.
10. **Blur values**: blurred amounts are not exposed in the accessibility tree as readable numbers (aria-hidden/label) if that is the intended privacy behaviour.

### 4.4 Visual regression

- `expect(page).toHaveScreenshot()` for key screens × {light, midnight, OLED gold} × {en, he} × {desktop, phone}: Login, Dashboard (populated + empty), Expenses, Add-transaction sheet, Plan detail, Loan detail, Savings detail, Notes grid, Groceries wall, Review, Recap card, Settings, locked screen.
- Determinism: run inside the official Playwright Docker image (same fonts), freeze the clock (`page.clock.setFixedTime`), seed fixed data, `animations: 'disabled'`, mask volatile regions (`mask: [page.getByTestId('relative-time')]`), `maxDiffPixelRatio: 0.01`.
- Baselines live in the repo (`e2e/__screenshots__`), updated only via a labelled workflow (`npx playwright test --update-snapshots` in CI, PR shows the diff images).

**As built (Phase 2):** `specs/visual/screens.visual.spec.js` in its own `visual` project (1280×800 Chromium; the phone
screen sets its own viewport). The clock is fixed at 17 June 2026 09:30 UTC, the time zone is UTC, the data is the
same every run, motion is reduced and animations are off; the account's address and toasts are masked. Approved
screenshots are in `e2e/screenshots/` and come from Linux, in CI, since text renders differently on each system
(no Docker here); on Windows the spec runs only with `E2E_VISUAL=1`, against local screenshots git ignores.
- **Compare:** the `e2e-visual` job on every push and pull request (`--update-snapshots=none`, so a screenshot with
  no approved one fails); on a difference its report artifact has the expected, actual and diff images.
- **Approve a change:** Actions › Check › Run workflow with *update screenshots*; download the `visual-screenshots`
  artifact into `ascent_webapp/e2e/screenshots` and commit it (`gh run download <id> -n visual-screenshots -D ascent_webapp/e2e/screenshots`).
- Still to add from the list above: the empty Dashboard, Plan, Loan and Savings detail, Notes, Groceries, Review, the
  recap card and the locked screen, and the other palettes.

### 4.5 Performance guardrails (nightly)

- Dashboard and Expenses with `big-data`: LCP < 2.5 s, INP < 200 ms, CLS < 0.1 under 4× CPU throttle + Fast 3G (CDP), measured with `PerformanceObserver` in-page and attached to the report.
- Route chunk sizes already guarded by `server/bundle.test.mjs`; E2E checks no route fetches more than its chunk set on first navigation.
- Pulse polling: an idle open app makes at most 18 requests/min (a pulse every 4 s, a heartbeat a minute, the household
  list every 30 s for who is online), and none while the tab is hidden. **Built:** `specs/shell/idle.spec.js`, with the
  browser clock installed and stepped 4 s at a time.

---

## 5. CI/CD integration & reporting

### 5.1 Pipeline overview

```
 PR opened/updated ─┬─ check (existing): lint → node tests → vitest → build → npm audit
                    ├─ build-e2e: vite build once → upload dist/ artifact
                    ├─ e2e-gate  (needs build-e2e): @smoke + @critical, Chromium desktop + phone, 4 shards  ← REQUIRED
                    ├─ e2e-burn-in: changed/added specs × --repeat-each=5                                ← REQUIRED
                    └─ report: merge blob reports → HTML artifact + PR comment + job summary

 push to main ──────── full suite: Chromium (all projects) + WebKit + Firefox(@critical), a11y, visual; 6 shards

 Vercel deployment_status=success (preview) ── @smoke against the preview URL (protection bypass header)

 nightly 02:00 IDT ─── full matrix + --repeat-each=3 flake hunt + perf + big-data + real-device checklist reminder
 every 30 min ──────── production synthetic: /api/health, /login renders, security headers
```

**Branch protection on `main`**: required checks `check`, `e2e-gate`, `e2e-burn-in`. Target PR feedback < 10 minutes.

### 5.2 Build once, test many (fixes G5)
`playwright.config.js` reads `E2E_PREBUILT=1` to run only `vite preview` (no build) in `webServer`; the CI job
downloads `dist/` from `build-e2e`. Locally nothing changes.

### 5.3 Parallel execution (fixes G4)
- `fullyParallel: true`, `workers: process.env.CI ? 3 : '50%'` — safe because every test owns its household and each worker has its own `X-Forwarded-For`.
- One API + Mongo per **shard machine** (started by `webServer`), shared by its workers. If profiling shows the single Node API saturating, move to per-worker API processes: a worker-scoped fixture starts `serve-api.mjs` on `3102 + workerIndex`, and the app is served per worker with a matching `API_PROXY_TARGET` (ports are already parameterised).
- `--shard=i/N` across machines; `N` chosen so each shard finishes in ~5 min.
- Multi-user tests open extra contexts inside the same worker — no cross-worker coordination needed.

### 5.4 GitHub Actions sketch

```yaml
# .github/workflows/e2e.yml (sketch — merges into check.yml)
jobs:
  build-e2e:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: ascent_webapp } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm, cache-dependency-path: ascent_webapp/package-lock.json }
      - run: npm ci
      - run: npx vite build
        env: { VITE_SENTRY_DSN: '' }
      - uses: actions/upload-artifact@v4
        with: { name: dist, path: ascent_webapp/dist, retention-days: 1 }

  e2e-gate:
    needs: build-e2e
    runs-on: ubuntu-latest
    container: mcr.microsoft.com/playwright:v1.63.0-noble     # browsers + fonts preinstalled, stable screenshots
    timeout-minutes: 20
    strategy:
      fail-fast: false
      matrix: { shard: [1, 2, 3, 4] }
    defaults: { run: { working-directory: ascent_webapp } }
    env: { CI: 'true', E2E_PREBUILT: '1', MONGOMS_DOWNLOAD_DIR: ${{ github.workspace }}/.mongodb-binaries }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm, cache-dependency-path: ascent_webapp/package-lock.json }
      - run: npm ci
      - uses: actions/download-artifact@v4
        with: { name: dist, path: ascent_webapp/dist }
      - uses: actions/cache@v4
        with: { path: '${{ github.workspace }}/.mongodb-binaries', key: mongodb-${{ hashFiles('ascent_webapp/package-lock.json') }} }
      - run: npx playwright test --grep "@smoke|@critical" --project=desktop-chromium --project=phone --shard=${{ matrix.shard }}/4
      - if: ${{ !cancelled() }}
        uses: actions/upload-artifact@v4
        with: { name: blob-${{ matrix.shard }}, path: ascent_webapp/blob-report, retention-days: 7 }

  e2e-burn-in:
    needs: build-e2e
    runs-on: ubuntu-latest
    container: mcr.microsoft.com/playwright:v1.63.0-noble
    steps:
      # …same setup…
      - id: changed
        run: echo "specs=$(git diff --name-only origin/${{ github.base_ref }}... -- 'e2e/**/*.spec.js' | tr '\n' ' ')" >> "$GITHUB_OUTPUT"
      - if: steps.changed.outputs.specs != ''
        run: npx playwright test ${{ steps.changed.outputs.specs }} --repeat-each=5 --retries=0

  e2e-report:
    needs: e2e-gate
    if: ${{ !cancelled() }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with: { pattern: blob-*, path: all-blobs, merge-multiple: true }
      - run: npx playwright merge-reports --reporter html,junit,github ./all-blobs
      - uses: actions/upload-artifact@v4
        with: { name: playwright-report, path: playwright-report, retention-days: 14 }
      # + publish JUnit to the job summary (e.g. dorny/test-reporter) and a sticky PR comment with pass/fail/flaky counts and the report link
```

### 5.5 Reporting & artifacts

`playwright.config.js` (CI):

```js
reporter: process.env.CI ? [['blob'], ['github'], ['list']] : [['list'], ['html', { open: 'on-failure' }]],
use: {
  trace: 'on-first-retry',          // full DOM/network/console timeline for anything that needed a retry
  video: 'retain-on-failure',
  screenshot: 'only-on-failure',
},
```

- **Merged HTML report** for every run (not only failures — gap G8), with traces, videos, screenshots, axe JSON and perf numbers attached per test.
- **GitHub annotations** (`github` reporter) put failures inline on the PR diff.
- **JUnit** → job summary table and test-analytics history.
- **PR comment**: totals, flaky list, new failures vs `main`, link to the report artifact (or a GitHub Pages copy per PR, deleted after merge).
- **Retention**: 14 days for reports, 7 for blobs/traces; nightly reports kept 30 days.
- **Failure triage**: each failed test's attachment set = trace.zip (open with `npx playwright show-trace`), video, final screenshot, server log excerpt (serve-api stdout captured per test via the control port), console errors.

### 5.6 Flaky-test policy

1. **Prevent**: `eslint-plugin-playwright` (`no-wait-for-timeout`, `no-force-option`, `prefer-web-first-assertions`, `no-networkidle` — note: `phone.spec.js` uses `networkidle`, which the PULSE poll makes unreliable; replace with an explicit "page ready" assertion); per-test isolation; frozen clock where time matters; hermetic stubs.
2. **Detect**: `retries: 2` in CI; a test that **passes on retry is reported as flaky** (Playwright's `flaky` status) and counted in the PR comment; burn-in (`--repeat-each=5`) for changed specs; nightly `--repeat-each=3` over the whole suite.
3. **Track**: a nightly job opens/updates a GitHub issue per flaky test (title = test id) with failure rate and last trace.
4. **Quarantine**: a test flaky twice in 7 days gets `@quarantine` → excluded from the gate (`--grep-invert @quarantine`), still run in a non-blocking job; an owner and a 7-day fix deadline; if not fixed, it is rewritten or deleted (never permanently quarantined).
5. **Budget**: flaky rate < 1% of runs on `main`; above it, new feature tests pause until the suite is stable.

### 5.7 Caching & speed

| Cache | Key |
| --- | --- |
| npm | `package-lock.json` (setup-node) |
| Playwright browsers | Use the Playwright container image (no download) or `~/.cache/ms-playwright` keyed on `@playwright/test` version |
| MongoDB binary | Existing `MONGOMS_DOWNLOAD_DIR` cache |
| `dist/` | Built once per workflow run (§5.2) |

`concurrency: cancel-in-progress` (exists) stops superseded runs.

### 5.8 Test-run hygiene in CI
- Fail the run on: any request to a non-localhost host (guard in fixtures), any `pageerror`, any console `error` not on an allow-list, any unhandled API 500 in the serve-api log.
- Upload the serve-api log on failure.
- Time budget per test 60 s (exists); slow tests (> 20 s) listed in the report and tagged `@slow` or split.

---

## 6. Rollout plan

| Phase | Scope | Exit criteria |
| --- | --- | --- |
| **0. Harness** ✅ | Fix G1–G5, G7–G8: seeding fixtures, per-test IP, third-party stubs + network guard, SMTP sink, control port, `E2E_PREBUILT`, parallel + sharding, merged reports, ESLint plugin, i18n label helper, screen objects | Existing tests migrated to fixtures, green 20× in a row with `--repeat-each=20` (see §0.2.1) |
| **1. P0 gate** ✅ | All P0 rows: auth core, transactions, installments, plans, loans, savings, tasks, notes, groceries core, ingest, import, offline core, isolation/CSRF, navigation, journeys J-01/J-05 | PR gate < 10 min, required on `main` |
| **2. P1 breadth** | All P1 rows: households & permissions matrix, AI (stubbed), review/recap, calendar, settings sections, RTL journeys, WebKit project, axe in flows, responsive matrix | Full suite < 20 min on 6 shards |
| **3. P2 depth** | Edge cases, visual regression, perf, flake hunt, preview-deploy smoke, prod synthetic, real-device checklist | Nightly green ≥ 95% of nights for 2 weeks |

**Definition of done for any new feature**: the PR adds its happy path (P0/P1), at least one negative and one
edge case from the checklist below, passes axe in its new states, and adds every new string to en/he/ru.

### 6.1 Per-feature checklist (copy into PR template)

- [ ] Happy path through the UI, result verified on screen **and** on the server (`serverList`)
- [ ] Validation errors for each required/limited field
- [ ] Server failure (500/503) and slow response handled
- [ ] View-only member and no-permission member (UI hidden + API 403)
- [ ] Offline behaviour (works and syncs, or says it needs a connection)
- [ ] Second household member sees the change (pulse)
- [ ] Phone layout: no overflow, 44 px targets, sheet behaviour
- [ ] Hebrew RTL and Russian long labels
- [ ] axe clean in every new state, keyboard reachable
- [ ] Limits: longest input, largest number, empty state
