import { useState } from 'react'
import { curriculum } from '../data/curriculum.ts'
import { useAppStore } from '../store/useAppStore.ts'
import './DevPanel.css'

/**
 * Dev-only tooling for exercising the progression engine without grinding through it
 * by hand. `import.meta.env.DEV` is a build-time constant — Vite replaces it with a
 * literal `false` in production, so this component (and everything it imports) is
 * dead code there and gets stripped by the bundler. Settings.tsx also gates its own
 * entry point the same way, so there is no reachable path to this panel in a
 * production build.
 */
export default function DevPanel() {
  if (!import.meta.env.DEV) return null
  return <DevPanelInner />
}

function DevPanelInner() {
  const state = useAppStore()
  const {
    setPhase,
    devCloseAllDailyUnits,
    devSetPhaseEntryDaysAgo,
    devResetAll,
  } = state
  const [days, setDays] = useState('30')

  return (
    <div className="devPanel">
      <p className="devPanel__label">Developer tools — dev builds only</p>

      <div className="devPanel__group">
        <p className="devPanel__groupLabel">Jump to phase</p>
        <div className="devPanel__row">
          {curriculum.phases.map((phase) => (
            <button
              key={phase.id}
              type="button"
              className="devPanel__chip"
              data-active={phase.id === state.currentPhaseId}
              onClick={() => setPhase(phase.id)}
            >
              {phase.order}
            </button>
          ))}
        </div>
      </div>

      <div className="devPanel__group">
        <button
          type="button"
          className="devPanel__button"
          onClick={devCloseAllDailyUnits}
        >
          Close all daily units in current phase
        </button>
      </div>

      <div className="devPanel__group">
        <p className="devPanel__groupLabel">Set phaseEntryDate back</p>
        <div className="devPanel__row">
          <input
            type="number"
            className="devPanel__input"
            value={days}
            onChange={(event) => setDays(event.target.value)}
            aria-label="Days ago"
          />
          <button
            type="button"
            className="devPanel__button"
            onClick={() => devSetPhaseEntryDaysAgo(Number(days) || 0)}
          >
            Apply
          </button>
        </div>
      </div>

      <div className="devPanel__group">
        <button
          type="button"
          className="devPanel__button devPanel__button--danger"
          onClick={() => {
            if (window.confirm('Reset all local progress? This cannot be undone.')) {
              devResetAll()
            }
          }}
        >
          Reset all state
        </button>
      </div>
    </div>
  )
}
