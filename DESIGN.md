---
name: Ascent
description: A calm, numbers-first household finance app in Midnight Indigo, with a light theme and an optional OLED black and gold palette.
colors:
  primary: "hsl(252 92% 70%)"
  primary-foreground: "hsl(234 40% 8%)"
  midnight-canvas: "hsl(234 34% 5.5%)"
  midnight-card: "hsl(234 28% 9%)"
  midnight-popover: "hsl(234 26% 12%)"
  midnight-secondary: "hsl(234 22% 15%)"
  midnight-accent: "hsl(240 30% 19%)"
  midnight-border: "hsl(234 20% 19%)"
  midnight-input: "hsl(234 20% 24%)"
  ink: "hsl(228 30% 96%)"
  ink-muted: "hsl(230 14% 68%)"
  success: "hsl(156 72% 52%)"
  danger: "hsl(350 90% 68%)"
  destructive: "hsl(350 85% 62%)"
  chart-1: "hsl(252 92% 72%)"
  chart-2: "hsl(190 92% 56%)"
  chart-3: "hsl(330 88% 68%)"
  chart-4: "hsl(40 96% 62%)"
  chart-5: "hsl(156 72% 52%)"
  light-primary: "hsl(252 78% 56%)"
  light-canvas: "hsl(230 30% 97%)"
  light-card: "hsl(0 0% 100%)"
  light-ink: "hsl(232 40% 10%)"
  light-ink-muted: "hsl(232 12% 40%)"
  light-border: "hsl(230 20% 89%)"
  light-success: "hsl(152 65% 32%)"
  light-danger: "hsl(350 75% 48%)"
  gold-primary: "hsl(43 95% 58%)"
  gold-canvas: "hsl(0 0% 0%)"
  gold-card: "hsl(40 8% 5.5%)"
  gold-accent: "hsl(42 30% 14%)"
typography:
  display:
    fontFamily: "Inter Variable, Heebo Variable, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "3rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Inter Variable, Heebo Variable, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1.11
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Inter Variable, Heebo Variable, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "normal"
  body:
    fontFamily: "Inter Variable, Heebo Variable, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
    letterSpacing: "normal"
  label:
    fontFamily: "Inter Variable, Heebo Variable, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.33
    letterSpacing: "normal"
rounded:
  sm: "12px"
  md: "14px"
  lg: "16px"
  xl: "12px"
  card: "24px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.xl}"
    height: "36px"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "hsl(252 92% 70% / 0.9)"
  button-secondary:
    backgroundColor: "{colors.midnight-secondary}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    height: "36px"
    padding: "8px 16px"
  button-outline:
    backgroundColor: "{colors.midnight-canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    height: "36px"
    padding: "8px 16px"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "#ffffff"
    rounded: "{rounded.xl}"
    height: "36px"
    padding: "8px 16px"
  card:
    backgroundColor: "{colors.midnight-card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "24px"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "4px 12px"
  badge:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    padding: "2px 10px"
  dialog:
    backgroundColor: "{colors.midnight-popover}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "24px"
  nav-item-active:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.xl}"
    padding: "10px 16px"
---

# Design System: Ascent

Sources: `ascent_webapp/src/index.css` (HSL CSS variables), `ascent_webapp/tailwind.config.js`, `src/components/ui/*`, `Layout.jsx`, `ThemeProvider.jsx`, `charts/EChart.jsx`, `pages/Dashboard.jsx`. Descriptive language and the North Star are inferred from shipped code, not confirmed by the user.

## Overview

**Creative North Star: "The Night Ledger"** (inferred)

A dark, quiet surface where money figures are the brightest thing on the screen. The default is Midnight Indigo: a near-black blue canvas with slightly lighter frosted cards, one luminous violet accent, and green and rose reserved for gain and loss. The light theme mirrors it on a cool off-white; the optional OLED palette swaps violet for gold on true black. All three are intentional brand commitments (PRODUCT.md) and every component reads colour from the same semantic variables, so a palette change never touches component code.

Density is medium: bento grids of rounded glass tiles, generous 24px card padding, large tightly tracked numerals for headline figures, and small muted labels. Motion is short and functional (state fades, a 0.97 press scale, 150ms grid transitions) and is stripped of movement under reduced-motion. Charts are drawn from the same tokens as the UI.

**Key Characteristics:**
- Semantic HSL variables only; three palettes (light, Midnight Indigo dark default, OLED gold) share one variable set.
- Frosted, softly lit tiles (blur, hairline border, inset top highlight) on a dark canvas with a single ambient accent glow behind the page.
- One accent per palette; success and danger are separate tokens, not the accent.
- Inter Variable with Heebo Variable fallback for Hebrew; tabular numerals in tables.
- RTL is first-class: logical utilities (ms-, me-, ps-, pe-, start-, end-).
- 12px minimum text size; 44px touch targets on coarse pointers.

## Colors

A single saturated violet on deep blue-black neutrals, with green and rose signalling money direction.

### Primary
- **Luminous Violet** (`primary`, dark; `light-primary` in the light theme): the one accent. Primary buttons, active sidebar item, avatar disc, focus ring (`ring` is a lighter step, hsl 252 95% 76%), savings-rate icon, chart series 1. Its glow (`--glow`, same hue) sits as a soft shadow under primary buttons and as a radial wash at the top of the Dashboard.
- **Gold** (`gold-primary`, only under `data-palette="gold"`): replaces violet everywhere the variable is used; on OLED black with warm-tinted neutrals. In light mode with gold, primary drops to hsl(36 92% 40%).

### Neutral
- **Midnight Canvas** (`midnight-canvas`): page background. Sidebar sits a step lighter (hsl 234 32% 7%).
- **Midnight Card** (`midnight-card`): tile surface, used at 75% opacity with blur. **Midnight Popover** (`midnight-popover`) is one step lighter for dialogs and menus.
- **Midnight Secondary / Accent** (`midnight-secondary`, `midnight-accent`): hover fills, secondary buttons, selected rows.
- **Midnight Border / Input** (`midnight-border`, `midnight-input`): hairlines are used at 50-60% opacity; input strokes use the stronger step.
- **Ink** and **Ink Muted** (`ink`, `ink-muted`): primary text and secondary labels. Secondary body text is often `foreground/80`.
- **Light theme** (`light-canvas`, `light-card`, `light-ink`, `light-ink-muted`, `light-border`): cool off-white canvas, pure white cards.

### Semantic
- **Success** and **Danger** (`success`, `danger`): gains, income, under-budget vs. losses, expenses, over-budget. Badges use them at 15% background with full-strength text. `destructive` is the separate red for delete actions.

### Chart series
`chart-1` to `chart-5`: violet, cyan, pink, amber, green (dark). Gold palette re-hues to gold, orange, teal, green, rose. Charts read these from the live CSS variables so palette and theme switches update them.

### Named Rules
**The One Accent Rule.** Only `primary` is a brand colour. Never add a second accent; use `success`/`danger` for meaning and `chart-*` for data series only.
**The Semantic Variable Rule.** Colour comes from a variable (`bg-card`, `text-muted-foreground`, `border-border`). Raw hex or hsl literals in components are not part of the system.
**The Three Palettes Rule.** Any new surface must be checked in light, Midnight Indigo and OLED gold.

## Typography

**Display / Body / Label Font:** Inter Variable (with Heebo Variable for Hebrew glyphs, then system-ui, -apple-system, Segoe UI, sans-serif). Font features `cv11` and `ss01` on.

**Character:** One neutral sans, hierarchy through size, weight and tight tracking rather than a second family. Heebo supplies matching Hebrew weights.

### Hierarchy
- **Display** (700, 3rem at md, 1 line-height, -0.025em): hero net-amount figure on the Dashboard (text-4xl on mobile, text-5xl at md).
- **Headline** (700, 1.875rem mobile / 2.25rem md, tracking-tight): page H1 (Dashboard, Settings).
- **Title** (600, 1rem): tile and card headings (h2). Large card titles use `leading-none tracking-tight`; dialog titles are 1.125rem.
- **Body** (400, 0.875rem): default UI text, descriptions in `muted-foreground`. Stat values step up to 1.5rem semibold, tracking-tight.
- **Label** (500, 0.75rem): chips, delta badges, bottom-nav labels. 12px is the floor.

### Named Rules
**The 12px Floor Rule.** No text below 12px (`text-xs`).
**The Steady Figures Rule.** Tables and columns of figures use tabular numerals (`.tabular`, `table`); money values are set large, semibold or bold, and tightly tracked.

## Layout

Fixed left (start-side) sidebar at md and up: 16rem wide, collapsible to 5rem, with content offset by `ps-64`/`pe-64` (or 20). Below md: a 4rem blurred top bar with the logo, a 4rem blurred bottom tab bar (icon pill plus 12px label, active pill at primary/15%), and a half-width menu sheet from the end edge for theme, blur-values, settings and logout.

Page content sits in `max-w-7xl` with `p-4` on mobile and `p-8` at md, `space-y-5` between bands, extra bottom padding on mobile to clear the tab bar. The Dashboard is a 6-column bento grid (`gap-4`, `gap-5` at md): hero tile spans 4, a stat stack spans 2, secondary tiles span 3. Spacing follows the Tailwind 4px scale; the common steps are 4, 8, 12, 16, 20, 24, 32. Direction is set on `<html>` and the shell from the user language (Hebrew is RTL); use logical utilities, and keep the react-grid-layout widget grid itself LTR with RTL content inside. Breakpoints are Tailwind defaults (sm 640, md 768). A "blur values" user setting masks money figures.

### Named Rules
**The Logical Edge Rule.** Use `ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`; not left/right.
**The Thumb Reach Rule.** Primary navigation lives at the bottom on phones; controls on coarse pointers get a hit area of at least 44px (see Buttons).

## Elevation & Depth

Hybrid: tonal layering plus one soft glass treatment. Tiles are translucent (`card` at 75%) with `backdrop-blur-xl`, a hairline border at 60% and an inset 1px top highlight, over a soft drop shadow. Overlays are opaque `popover` with a large radius. Colour glow, not black shadow, marks the primary action.

### Shadow Vocabulary
- **Tile** (`box-shadow: inset 0 1px 0 0 hsl(var(--foreground)/0.05), 0 8px 30px -14px hsl(0 0% 0%/0.45)`): every Card.
- **Primary glow** (`box-shadow: 0 6px 20px -6px hsl(var(--glow)/0.55)`): default button only.
- **Drag lift** (`box-shadow: 0 10px 40px -10px rgba(0,0,0,0.3)`): dashboard widget while dragging.
- **Page wash** (`radial-gradient(60% 60% at 50% 0%, hsl(var(--glow)/0.20), transparent 70%)`): ambient light behind the Dashboard top.
- Sidebar-edge and small controls use Tailwind `shadow-sm`/`shadow-lg`.

### Named Rules
**The Quiet Glow Rule.** Depth is soft and low-contrast; the accent glow is reserved for the single primary action and the page wash.

## Shapes

Generously rounded. `--radius` is 1rem: `lg` 16px, `md` 14px, `sm` 12px. Cards and dialogs (from sm up) use 24px (`rounded-3xl`); buttons, nav items and menus use 12px (`rounded-xl`); small buttons 8px; inputs 14px; segmented controls, delta chips, avatars and icon buttons are full pills or circles. Borders are 1px hairlines at reduced opacity. Icons are Lucide line icons, 16px in buttons and 20px in nav.

## Components

### Buttons
- **Shape:** 12px radius, 36px tall default (sm 32px, lg 44px, icon 36px square). On coarse pointers, sm and icon extend an invisible 6px hit area to reach 44px.
- **Primary:** Luminous Violet fill, dark text (`primary-foreground`), 16px horizontal padding, primary glow; hover at 90% opacity.
- **Hover / Focus:** press scales to 0.97 (disabled under reduced motion); focus is a 2px `ring` outline; disabled at 50% opacity.
- **Secondary / Outline / Ghost / Destructive / Link:** secondary is a raised neutral fill; outline is 1px input stroke with blurred translucent canvas, hover to accent; ghost fills with accent on hover; destructive is the red fill; link is primary text with underline on hover.

### Cards / Containers
- **Corner Style:** 24px.
- **Background:** translucent card with blur; nested icon wells use `foreground/5` at 12px radius.
- **Shadow Strategy:** the Tile shadow above.
- **Internal Padding:** 24px (`p-6`) standard, 20px for compact stat tiles.

### Inputs / Fields
- **Style:** 1px `input` stroke, transparent fill, 14px radius, 36px tall, 12px horizontal padding; base 16px text on mobile, 14px at md.
- **Focus:** 1px `ring` outline. **Disabled:** 50% opacity, not-allowed cursor.

### Chips / Badges
- Badge: 14px radius, 12px semibold text, primary/secondary/destructive/outline variants. Status pills on the Dashboard are full-round with 15% success or danger tint and full-strength text.

### Navigation
- **Desktop sidebar:** card-coloured column, 1px end border, items 12px radius with 14px medium text; active item is a solid primary fill, inactive items are `foreground/80` with accent hover. Round primary collapse handle on the edge.
- **Mobile:** bottom tab bar described in Layout; active item uses a primary/15% icon pill.

### Dialogs
- Opaque popover, 24px radius from sm up, 1px hairline border, 24px padding, black 80% overlay, fade and zoom-in 95% entrance.

### Charts
- Apache ECharts on canvas via `EChart`, coloured from `useChartTokens` (foreground, muted, border at 60% for grid, card, popover, primary, success, danger, `chart-1..5`), same font family, re-resolved on palette or theme change. Each chart has an `aria-label`.

## Do's and Don'ts

### Do:
- **Do** take every colour from a semantic variable so light, Midnight Indigo and gold all work.
- **Do** use logical utilities for all horizontal spacing, position and alignment.
- **Do** set money figures large, semibold or bold, tightly tracked, and tabular in columns; honour the blur-values setting.
- **Do** use success and danger for direction of money, tinted at 15% for pills, and keep warnings calm.
- **Do** keep touch targets at 44px on coarse pointers and text at 12px or larger.
- **Do** pass chart colours through `useChartTokens`.

### Don't:
- **Don't** introduce a second brand accent or hard-coded palette values.
- **Don't** use physical `left`/`right`/`ml`/`mr`/`pl`/`pr` on surfaces that must flip in Hebrew.
- **Don't** add movement that is not neutralised by the reduced-motion block (entrance translate and scale variables, press scale).
- **Don't** use `card` with blur on top of another blurred tile; nest with flat tints (`foreground/5`) instead.

<!-- Known gap: the gold palette does not restyle success/danger/destructive; it inherits the Midnight Indigo values, which is intentional so status colours stay recognisable. -->
