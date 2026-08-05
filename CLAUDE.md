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
  component CSS.
