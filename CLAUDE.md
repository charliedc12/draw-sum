# DrawPath

A step-by-step drawing practice curriculum with checkboxes. The user draws on paper.
The app's only inputs are taps. Its single job is to answer "what do I draw today"
and "am I ready to move on."

Mobile web app, installed to the iOS home screen as a PWA.

## Never build

- No drawing canvas or any input surface for art
- No camera, image upload, or photo storage
- No scoring, rating, grading, or quality assessment of any kind
- No AI or model calls, no image analysis
- No backend, auth, accounts, or network requests of any kind
- No leaderboards, social feed, sharing, or community features
- No video or written lessons beyond the short step instructions
- No guilt-based streak mechanics or "you broke your streak" framing
- No hard-blocking timers

## Constraints

- **Offline-first.** The app must work fully with no network. There is nothing to
  fetch, so there is nothing to fail.
- **All state in localStorage.** No IndexedDB, no server, no sync. Read on load,
  write on change.
- **Mobile-first layout designed for a 390px viewport** (iPhone 14/15/16 logical
  width). Larger screens get a centered column, not a redesign.
- **No CSS framework.** Plain CSS with custom properties. No Tailwind, no CSS-in-JS,
  no component library.
- **Dark mode via `prefers-color-scheme`.** No theme toggle, no stored preference.

## Curriculum is data, not code

All steps, subjects, failure lines, gate statements and session stages live in
`src/data/curriculum.json`. The curriculum is content, and content gets revised —
rewording a failure line, retiming a drill, or reordering a unit must never require
touching logic. `src/logic/` reads the curriculum; it never hardcodes any part of it.

The source text is `docs/CURRICULUM.md`. The JSON is derived from it, and the doc stays
authoritative for wording.

**Never delete a step or unit ID — deprecate it.** Saved user progress references those
IDs (`unitRepCounts`, `stepCompletionCounts`, `stepSkipCounts`, `log[].targetId`).
Deleting an ID orphans somebody's history; reusing one silently rewrites it. To retire a
step, remove it from its unit's `stepIds` and leave the step itself in place.

ID conventions: phase `p<n>`, unit `u<phase>.<unit>`, step `s<phase>.<unit>.<step>`.
The unit segment is also its display label, so `u1.W` renders as "UNIT 1.W".

Run `npm run validate:curriculum` after editing the JSON. It fails on schema errors,
dangling step or unit IDs, and units whose `requiredReps` is below their step count.

**Renaming an ID is a migration, not a delete.** If a unit or step genuinely needs a
new ID (not just deprecation), bump `curriculum.json`'s top-level `version` and add an
entry to `CURRICULUM_MIGRATIONS` in `src/logic/migrations.ts` mapping the old ID to the
new one. `hydrate()` runs every saved state through it on load, so existing progress
follows the rename instead of silently losing history. See `migrations.test.ts` for
what a migration needs to prove: everything remapped, nothing lost.

## Stack

Vite + React + TypeScript. `react-router-dom` with a `HashRouter` — deep links work
on any static host with zero server configuration. `vite-plugin-pwa` for the manifest
and service worker. `vitest` + `@testing-library/react` for tests.

## Layout

`src/`
- `components/AppLayout.tsx` — header, routed content, tab bar
- `components/TabBar.tsx` — bottom navigation
- `routes/` — one file per screen
- `styles/global.css` — design tokens, reset, app shell

## Navigation

Four tabs: **Today**, **Path**, **Session**, **Log**.

Progress and Settings are deliberately *not* tabs. Progress is reached from inside
Path, so it sits one level deeper than daily use — the daily loop should not lead
with a dashboard. Settings is reached from the header icon.

## Conventions

- Minimum 16px body text, minimum 44px touch targets.
- Respect `env(safe-area-inset-*)` on anything pinned to a screen edge.
- Colors come from custom properties in `global.css`. Do not hardcode hex values in
  component CSS. Every token is checked against WCAG AA in `src/styles/contrast.test.ts`
  — `text-faint` and `border-strong` in particular are tuned to just clear 4.5:1 and
  3:1 respectively, so don't lighten either without re-running that test.
- Any `flex: 1` row of sibling elements that can contain a long, unbreakable word
  (a tab label, a stat label) needs `min-width: 0` on the flex item — the default
  `min-width: auto` floors it at the word's own width and can push the row past the
  viewport at large iOS text sizes. See `TabBar.css` for the reference fix.
