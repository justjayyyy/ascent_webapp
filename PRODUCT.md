# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Households and couples who manage money together: two or more people who each log and review the same finances. A wider public launch (Hebrew, Russian and English speakers, with sign-ups) is a possible future direction, not the current audience. Mostly used on phones, in short check-ins (logging an expense, checking a budget, glancing at net worth) with occasional longer review sessions on desktop.

## Product Purpose
Ascent is a personal finance tracker that puts day-to-day spending and long-term investing in one place: income and expenses with categories and budgets, investment accounts and positions, financial goals, and a dashboard that summarizes it. Success is that a household can see where their money went and where their wealth stands without juggling separate apps or spreadsheets.

## Positioning
- Expenses and investment portfolio live together, not in separate tools.
- Hebrew, Russian and English are first-class, including real right-to-left layout.
- Private by default: data comes from the household itself (typed in, Apple Pay taps and card SMS forwarded by an iOS Shortcut, or statements imported from a file read on the device); there is no bank linking or third-party aggregator.
- Shared access with permissions: owners invite others and control what they can see.

## Operating Context
Installable PWA (React, Vite, Tailwind, Radix UI) with a Node/Vercel serverless API and MongoDB; JWT auth with optional Google sign-in. Multi-currency amounts are converted for dashboard and portfolio totals. Optional Google Calendar integration and a weekly summary email. Data can be exported as CSV from Settings, and card or bank statements (Excel/CSV) can be imported; imported rows are matched against payments already recorded. An optional AI assistant (Claude by Anthropic, `ANTHROPIC_API_KEY`) logs expenses from plain language and answers questions from an aggregated spending summary; it is off until a workspace owner or admin turns it on.

## Capabilities and Constraints
- Areas: Dashboard (safe to spend this month, month-end forecast, budget pace, subscriptions, who owes whom), Expenses (transactions, categories, budgets, cards, recurring, big purchases paid in installments), Income (its own page), Plans (big upcoming events such as a trip or a wedding, with dated costs paid over months), Portfolio (accounts, positions, sell/day-trade history), Notes (Keep-style: lists, labels, colours, reminders, multi-select, dictation), Calendar, Settings (profile, household options, shared users, Apple Pay and SMS capture, statement import, export). Expenses can record who paid and be split between members, with a settle-up balance.
- Phones: a floating bottom dock (Dashboard, Expenses, +, Plans, Notes; the + adds to the page on screen, long press for more), dialogs as bottom sheets that swipe down to close, pull to refresh, and haptics. Income, Settings and the calendar stay in the menu.
- Offline: the app opens on the last data it saw (cached session and query cache in IndexedDB); adding, editing and deleting transactions works without a connection and syncs in order later, idempotently (`app:` dedupe keys).
- Security: Face ID / fingerprint lock per device instead of the idle sign-out, and passkey sign-in (WebAuthn via SimpleWebAuthn); unlock works offline on the device.
- Monthly Recap: the month as full-screen stories (where it went, biggest purchase, weekday rhythm, quiet days, who paid) with a shareable image card that shows only percentages when values are blurred.
- Roles: an owner plus invited users with per-area permissions (for example view expenses).
- Every UI string must exist in English, Hebrew and Russian; layout must work in RTL.
- Portfolio and account-detail pages are hidden in this build (see `src/lib/features.js`); investment features return later. Whether Ascent becomes a public, billed product is undecided.

## Brand Commitments
Name "Ascent" with a mountain-climber logo (light and dark variants in `public/`). The midnight-indigo dark theme, the light theme and the optional OLED black + gold palette are intentional and must be kept.

## Evidence on Hand
A seeded demo account and test-data scripts exist under `server/scripts/`. There are no customer testimonials, benchmarks or pricing to cite; do not invent them.

## Product Principles
1. Numbers first: money figures are the content, so they stay legible, aligned and unambiguous.
2. Fast on a phone: logging a transaction takes seconds and works one-handed.
3. Equal in every language: Hebrew, Russian and English get the same quality, and right-to-left is a first-class layout rather than a mirror afterthought.
4. Private by design: no silent data collection or bank connections; sharing is explicit and permissioned.
5. Calm about money: clear status and gentle warnings (for example over-budget) rather than alarm.

## Accessibility & Inclusion
Target WCAG AA: sufficient contrast, labelled controls, keyboard support, touch targets of at least 44px, and reduced-motion support. Users read right-to-left (Hebrew) and left-to-right (English, Russian).
