# DrawPath

A step-by-step drawing practice curriculum with checkboxes. You draw on paper; the
app answers "what do I draw today" and "am I ready to move on." Nothing else.

Mobile web app, installed to the iOS home screen as a PWA. Offline-first, no backend,
all state in `localStorage`.

## Develop

```bash
npm install
npm run dev -- --host   # --host to open it on a phone on the same wifi
```

```bash
npm test        # vitest
npm run build   # type-check + production build
```

See [CLAUDE.md](CLAUDE.md) for the scope boundaries and design constraints.
