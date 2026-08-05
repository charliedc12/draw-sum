import { useEffect } from 'react'
import { curriculum } from '../data/curriculum.ts'
import { daysSince, findPhase, findUnit, isSessionRatioLow, isUnitClosed } from '../logic/progression.ts'
import { useAppStore } from '../store/useAppStore.ts'
import './Progress.css'

/* Reached only from Path — one level deeper than daily use, on purpose. Plain facts,
   no charts, no percentage of "overall" progress, no skill level, no comparison to
   anyone else. */
export default function Progress() {
  const state = useAppStore()
  const hydrate = useAppStore((s) => s.hydrate)

  useEffect(() => {
    hydrate()
  }, [hydrate])

  const phase = findPhase(curriculum, state.currentPhaseId)

  if (!phase) {
    return (
      <section className="screen">
        <h1 className="screen__title">Progress</h1>
        <p>There's no phase to report on right now.</p>
      </section>
    )
  }

  const units = phase.unitIds
    .map((id) => findUnit(curriculum, id))
    .filter((u): u is NonNullable<typeof u> => u !== undefined)
  const closedUnits = units.filter((u) => isUnitClosed(state, u)).length
  const weeksElapsed = Math.floor(daysSince(state.phaseEntryDate, new Date()) / 7)
  const ticks = state.gateTicks[phase.id] ?? phase.gateStatements.map(() => false)

  return (
    <section className="screen">
      <h1 className="screen__title">Progress</h1>

      <div className="progressBlock">
        <p className="progressBlock__phase">
          Phase {phase.order} — {phase.name}
        </p>
        <p className="progressBlock__line">
          {weeksElapsed} of {phase.maxWeeks} weeks
        </p>
        <p className="progressBlock__line">
          {closedUnits} of {units.length} units closed
        </p>
      </div>

      <div className="stats">
        <div className="stats__figure">
          <span className="stats__value">{state.drillCount}</span>
          <span className="stats__label">Drills</span>
        </div>
        <div className="stats__figure">
          <span className="stats__value">{state.sessionCount}</span>
          <span className="stats__label">Sessions</span>
        </div>
      </div>

      {isSessionRatioLow(state) && (
        <p className="progressBlock__note">
          Drill-only practice builds line control but not the ability to finish a
          drawing.
        </p>
      )}

      {phase.gateStatements.length > 0 && (
        <div className="gatePreview">
          <p className="gatePreview__label">What this phase's gate asks</p>
          <ul className="gatePreview__list">
            {phase.gateStatements.map((statement, index) => (
              <li key={`${phase.id}-${index}`} className="gatePreview__item">
                <span className="gatePreview__mark" aria-hidden="true">
                  {ticks[index] ? '☑' : '☐'}
                </span>
                <span className="gatePreview__text">{statement.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
