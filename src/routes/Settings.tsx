import DevPanel from './DevPanel.tsx'

export default function Settings() {
  return (
    <section className="screen">
      <h1 className="screen__title">Settings</h1>
      {/* Statically false in production — Vite dead-code-eliminates this branch and
          DevPanel along with it, so there is no reachable entry point in a prod build. */}
      {import.meta.env.DEV && <DevPanel />}
    </section>
  )
}
