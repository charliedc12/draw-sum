# DrawPath

A step-by-step drawing practice curriculum with checkboxes. You draw on paper; the
app answers "what do I draw today" and "am I ready to move on." Nothing else.

Mobile web app, installed to the iOS home screen as a PWA. Offline-first, no backend,
all state in `localStorage` — see [CLAUDE.md](CLAUDE.md) for the full scope boundaries
and design constraints.

## Develop

```bash
npm install
npm run dev -- --host   # --host to open it on a phone on the same wifi
```

## Test

```bash
npm test                   # vitest, once
npm run test:watch         # vitest, watch mode
npm run validate:curriculum # schema + integrity checks on src/data/curriculum.json
npm run lint                # oxlint
```

## Build

```bash
npm run build     # type-check, then production build to dist/
npm run preview   # serve dist/ locally, exactly as it will run in production
```

`npm run preview` is the real check before shipping: it serves the actual built
output (not the dev server), so it's the way to confirm the service worker
registers and the app still works with the network cut off entirely — this app
makes zero network requests by design, so if it loads once, it works offline.

## Deploy

`dist/` is a plain static folder — any static host works. To deploy it to Vercel:

```bash
npm run build
npx vercel login       # first time only, interactive
npx vercel dist --prod
```

`vercel login` needs a Vercel account (free) — it opens a browser to sign in, or
create one on the spot if you don't have one yet. Run this yourself; nothing in
this repo authenticates on your behalf.

The first `vercel dist --prod` will ask a few setup questions (all answerable with
the defaults): which scope/account to deploy under, whether to link to an existing
project (no, for a first deploy), and the project name. After that it deploys and
prints the live URL. Vercel serves everything over HTTPS automatically, which the
service worker and any future notification permissions require.
