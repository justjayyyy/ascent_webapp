---
target: entire Ascent app
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Users\\meres\\OneDrive\\Desktop\\ascent\\ascent\\ascent_webapp\\src"
timestamp: 2026-09-29T16-40-30Z
slug: ascent-webapp-src
---
Method: dual-agent (A: design review, B: detector + browser evidence)

# Critique: Ascent (entire app), heuristic score 24/40 (Acceptable)

Scores as assessed, before the P1 fixes. Items marked fixed were fixed afterwards.

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Over-budget bar stays brand purple |
| 2 | Match with the real world | 2 | Three donut rows all say "Card"; jargon; portfolio wording remains |
| 3 | User control and freedom | 3 | Categories have delete but no edit |
| 4 | Consistency and standards | 2 | Nav active colour differed (fixed); "User" vs "Owner" |
| 5 | Error prevention | 2 | Healthcare preselected; description required (fixed) |
| 6 | Recognition rather than recall | 3 | Settings hidden in user menu; Calendar is a modal |
| 7 | Flexibility and efficiency | 2 | No quick-add (fixed); no repeat budget or split |
| 8 | Aesthetic and minimalist design | 2 | Seven blocks compete on Expenses |
| 9 | Error recovery | 3 | Raw shareWithTeam key (fixed) |
| 10 | Help and documentation | 2 | Little contextual help |

## Design specificity verdict
Brand is specific (logo, tagline, palette picker, calm over-budget wording, Blur Values); layout is category-interchangeable (rounded dark cards, purple glow, Income/Expenses/Net row). Nothing said "household".
Detector: overused-font (Inter, true positive, taste call); bounce-easing (false positive, reduced-motion rule).

## Priority issues
- P1 Household absent from UI: partly fixed (authorship chips, person filter; unverified with a second member). Open: "Who paid" (needs server change), shared-with labels on budgets, solo-flavoured Dashboard headline.
- P1 Logging an expense is slow: fixed (amount first, category chips, optional description, remembered choices, pinned action bar, thumb-reach add button).
- P1 Touch targets and mobile hierarchy: mostly fixed. Open: Settings Edit/Invite, dashboard month arrows and View all, 28px sidebar toggle.
- P2 Focus ring is 50%-alpha violet (index.css:58); Settings permission labels 3.54:1.
- P2 Over-budget bar and payment breakdown ambiguous (three "Card" rows).
- P2 Copy debt: portfolio strings, Related Account, no import, Notes subtitle.

## Persona red flags
Power user: no add shortcut, separate modals, 5 rows per page. First-timer: unexplained Alert Threshold, Calendar Google wall, empty Dashboard. Hebrew-speaking partner on a phone: "-$35" rendered "$35-" under forced RTL, English key in Hebrew UI (fixed), 32px targets (mostly fixed), no shared cue (partly fixed).

## Minor observations
Blank band on desktop Dashboard; Calendar modal vs page inconsistency; 28px sidebar toggle; low-contrast disabled profile fields; triple category encoding; slow dialog fade-out.

## Questions
1. What tells a couple this is ours, not mine?
2. Should the app lead with how much is left this month, together, until Portfolio returns?
3. What if the headline metric were days until the next category goes over budget?
