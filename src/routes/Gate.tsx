import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { curriculum } from '../data/curriculum.ts'
import { findPhase, getUntickedStatementIndices, isTopUpActive } from '../logic/progression.ts'
import { useAppStore } from '../store/useAppStore.ts'
import './Gate.css'

/* Self-assessment, not a test. There is no "pass" — only a checklist the user reads
   honestly, a way to keep drilling the parts that aren't true yet, and an escape
   hatch that's always available because people under-rate their own readiness. */
export default function Gate() {
  const navigate = useNavigate()
  const state = useAppStore()
  const { hydrate, tickGate, advancePhase, startTopUp } = state

  useEffect(() => {
    hydrate()
  }, [hydrate])

  const phase = findPhase(curriculum, state.currentPhaseId)

  if (!phase) {
    return (
      <section className="screen">
        <h1 className="screen__title">Gate</h1>
        <p className="gate__intro">There's no phase to gate right now.</p>
      </section>
    )
  }

  const nextPhase = curriculum.phases.find((p) => p.order === phase.order + 1)
  const ticks = state.gateTicks[phase.id] ?? phase.gateStatements.map(() => false)
  const untickedCount = getUntickedStatementIndices(state, curriculum, phase.id).length
  const allTicked = phase.gateStatements.length > 0 && untickedCount === 0
  const topUpActive = isTopUpActive(state, curriculum)

  function handleAdvance() {
    advancePhase()
    navigate('/')
  }

  function handleAdvanceAnyway() {
    if (!nextPhase) return
    const ok = window.confirm(
      `Advance to Phase ${nextPhase.order} even though some statements aren't ticked yet? This list stays here — you can come back to it any time.`,
    )
    if (!ok) return
    advancePhase()
    navigate('/')
  }

  function handleStartTopUp() {
    startTopUp()
    navigate('/')
  }

  if (!nextPhase) {
    return (
      <section className="screen">
        <h1 className="screen__title">Gate</h1>
        <p className="gate__phase">
          Phase {phase.order} — {phase.name}
        </p>
        <p className="gate__intro">
          This phase doesn't have a gate. It's meant to continue — there's no next
          phase to move into.
        </p>
      </section>
    )
  }

  return (
    <section className="screen">
      <h1 className="screen__title">Gate</h1>
      <p className="gate__phase">
        Phase {phase.order} — {phase.name}
      </p>
      <p className="gate__intro">Check the statements below as they hold true for you.</p>

      <ul className="gate__list">
        {phase.gateStatements.map((statement, index) => (
          <li key={`${phase.id}-${index}`} className="gate__item">
            <label className="gate__label">
              <input
                type="checkbox"
                className="gate__checkbox"
                checked={Boolean(ticks[index])}
                onChange={(event) => tickGate(phase.id, index, event.target.checked)}
              />
              <span className="gate__text">{statement.text}</span>
            </label>
          </li>
        ))}
      </ul>

      {allTicked ? (
        <div className="actions">
          <button
            type="button"
            className="actions__button actions__button--primary"
            onClick={handleAdvance}
          >
            Advance to Phase {nextPhase.order}
          </button>
        </div>
      ) : (
        <div className="gate__unticked">
          <p className="gate__unticked-copy">
            Some of these aren't true yet. You can keep practicing the drills behind
            them for two weeks, or move on now — this list stays here either way.
          </p>
          {topUpActive && (
            <p className="gate__topUpStatus">
              Extra practice on these is already active for this phase.
            </p>
          )}
          <div className="actions">
            <button
              type="button"
              className="actions__button actions__button--primary"
              onClick={handleStartTopUp}
            >
              Keep practicing these
            </button>
            <button
              type="button"
              className="actions__button actions__button--secondary"
              onClick={handleAdvanceAnyway}
            >
              Advance anyway
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
