import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { curriculum } from '../data/curriculum.ts'
import { getTodayStep } from '../logic/progression.ts'
import type { TodayView } from '../logic/progression.ts'
import { useAppStore } from '../store/useAppStore.ts'
import './Today.css'

/* The whole screen is one card: what to draw, and two ways to answer. Nothing here
   asks how the drawing turned out. */
export default function Today() {
  const state = useAppStore()
  const { hydrate } = state

  useEffect(() => {
    hydrate()
  }, [hydrate])

  const view = getTodayStep(state, curriculum)

  return (
    <section className="today">
      {state.forcedAdvance && (
        <ForcedAdvanceNotice
          phaseName={view.kind === 'empty' ? '' : view.phase.name}
          onDismiss={state.acknowledgeForcedAdvance}
        />
      )}
      <TodayCard view={view} />
    </section>
  )
}

function TodayCard({ view }: { view: TodayView }) {
  const markStepDone = useAppStore((s) => s.markStepDone)
  const markStepSkipped = useAppStore((s) => s.markStepSkipped)
  const completeSession = useAppStore((s) => s.completeSession)

  if (view.kind === 'session') {
    return (
      <article className="card">
        <p className="card__breadcrumb">
          {phaseLabel(view.phase.order)} · SESSION
        </p>
        <h1 className="card__title">Time for a longer session</h1>
        <p className="card__meta">
          {view.drillsOwed} drills since your last one
        </p>

        <p className="card__lede">
          Short drills build the hand. The long session is where they turn into
          drawings. Take one before the next drill.
        </p>

        {view.unit && (
          <ol className="card__instructions">
            {view.steps.map((step) => (
              <li key={step.id}>
                <span className="card__sessionStep">{step.name}</span>
                <span className="card__sessionMeta">{step.durationMin} min</span>
              </li>
            ))}
          </ol>
        )}

        <div className="actions">
          <button
            type="button"
            className="actions__button actions__button--primary"
            onClick={completeSession}
          >
            Session done
          </button>
        </div>
      </article>
    )
  }

  if (view.kind === 'gate') {
    return (
      <article className="card">
        <p className="card__breadcrumb">{phaseLabel(view.phase.order)} · GATE</p>
        <h1 className="card__title">You've finished the {view.phase.name} drills</h1>
        <p className="card__lede">
          Every daily unit in this phase has met its reps. The gate is a short read
          through what should feel different now.
        </p>
        <div className="actions">
          <Link to="/gate" className="actions__button actions__button--primary">
            Open the gate
          </Link>
        </div>
      </article>
    )
  }

  if (view.kind === 'empty') {
    return (
      <article className="card">
        <h1 className="card__title">Nothing scheduled</h1>
        <p className="card__lede">
          There's no unit to draw from right now. Pick a phase in Settings.
        </p>
      </article>
    )
  }

  const { step, unit, phase, stepNumber } = view

  return (
    <article className="card">
      <p className="card__breadcrumb">
        {phaseLabel(phase.order)} · UNIT {unitLabel(unit.id)} · STEP {stepNumber}
      </p>

      <h1 className="card__title">{step.name}</h1>

      <p className="card__meta">
        {step.durationMin} min · {step.materials}
      </p>

      <ol className="card__instructions">
        {step.instructions.map((instruction) => (
          <li key={instruction}>{instruction}</li>
        ))}
      </ol>

      <div className="subject">
        <p className="subject__label">
          {step.subject.kind === 'fromLife' ? 'Draw, from life' : 'Draw, from reference'}
        </p>
        <p className="subject__text">{step.subject.text}</p>
      </div>

      {step.commonFailure && (
        <div className="failure">
          <p className="failure__label">Common failure</p>
          <p className="failure__text">{step.commonFailure}</p>
        </div>
      )}

      {view.alternate && (
        <p className="card__alternate">
          Keeps not happening? There's another way in:{' '}
          <span className="card__alternateName">{view.alternate.name}</span>
        </p>
      )}

      <div className="actions">
        <button
          type="button"
          className="actions__button actions__button--primary"
          onClick={() => markStepDone(step.id)}
        >
          Done
        </button>
        <button
          type="button"
          className="actions__button actions__button--secondary"
          onClick={() => markStepSkipped(step.id)}
        >
          Skip
        </button>
      </div>

      {/* Wired up in a later milestone: offers a shorter version of the same step. */}
      <button type="button" className="card__shortcut">
        Less than five minutes?
      </button>
    </article>
  )
}

function ForcedAdvanceNotice({
  phaseName,
  onDismiss,
}: {
  phaseName: string
  onDismiss: () => void
}) {
  return (
    <div className="notice" role="status">
      <p className="notice__text">
        Your last phase ran its full length, so you're on {phaseName || 'the next phase'}{' '}
        now. Time moved you, not your work — you can move back whenever you want.
      </p>
      <button type="button" className="notice__dismiss" onClick={onDismiss}>
        Got it
      </button>
    </div>
  )
}

function phaseLabel(order: number): string {
  return `PHASE ${order}`
}

/* Unit IDs carry their own label: u1.W renders as "1.W". See CLAUDE.md. */
function unitLabel(unitId: string): string {
  return unitId.replace(/^u/, '')
}
