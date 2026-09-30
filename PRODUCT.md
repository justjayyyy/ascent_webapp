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
- Manual and private: the user enters their own data; there is no bank linking or third-party aggregator.
- Shared access with permissions: owners invite others and control what they can see.

## Operating Context
Installable PWA (React, Vite, Tailwind, Radix UI) with a Node/Vercel serverless API and MongoDB; JWT auth with optional Google sign-in. Multi-currency amounts are converted for dashboard and portfolio totals. Optional Google Calendar integration and a weekly summary email. Data can be exported as CSV from Settings; there is no import yet.

## Capabilities and Constraints
- Areas: Dashboard, Expenses (transactions, categories, budgets, cards, recurring, big purchases paid in installments), Income (its own page), Plans (big upcoming events such as a trip or a wedding, with dated costs paid over months), Portfolio (accounts, positions, sell/day-trade history), Notes (Keep-style: lists, labels, colours, reminders, multi-select, dictation), Calendar, Settings (profile, shared users, import/export).
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
