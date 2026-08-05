import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { curriculum } from '../data/curriculum.ts'
import {
  RISING_STANDARDS_COPY,
  getDueRedrawRound,
  getDueRisingStandardsMilestone,
  getTodayStep,
  unitLabel,
} from '../logic/progression.ts'
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
  const now = new Date()
  const dueRisingStandardsDay = getDueRisingStandardsMilestone(state, now)
  const dueRedrawDay = getDueRedrawRound(state, now)

  return (
    <section className="today">
      {state.forcedAdvance && (
        <ForcedAdvanceNotice
          phaseName={view.kind === 'empty' ? '' : view.phase.name}
          onDismiss={state.acknowledgeForcedAdvance}
        />
      )}
      {dueRisingStandardsDay !== null && (
        <RisingStandardsCard
          onDismiss={() => state.dismissRisingStandardsCard(dueRisingStandardsDay)}
        />
      )}
      {dueRedrawDay !== null && (
        <RedrawCard onComplete={() => state.completeRedrawRound(dueRedrawDay)} />
      )}
      <TodayCard view={view} />
    </section>
  )
}

function TodayCard({ view }: { view: TodayView }) {
  const markStepDone = useAppStore((s) => s.markStepDone)
  const markStepSkipped = useAppStore((s) => s.markStepSkipped)

  if (view.kind === 'session') {
    return (
      <article className="card">
        <p className="card__breadcrumb">{phaseLabel(view.phase.order)} · SESSION</p>
        <h1 className="card__title">Time for a longer session</h1>
        <p className="card__meta">{view.drillsOwed} drills since your last one</p>

        <p className="card__lede">
          Short drills build the hand. The long session is where they turn into
          drawings. Take one before the next drill.
        </p>

        <div className="actions">
          <Link to="/session" className="actions__button actions__button--primary">
            Start a session
          </Link>
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

      {view.supportingNote && (
        <p className="card__supportingNote">{view.supportingNote}</p>
      )}

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

      <MicroDrillPicker />
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
      {phaseName && <p className="notice__phase">Now on {phaseName}</p>}
      <p className="notice__text">
        Staying too long in an early phase is far more common, and far more damaging,
        than moving on before you feel ready. The earlier skills keep developing inside
        the later work. You can go back any time from the Path screen.
      </p>
      <button type="button" className="notice__dismiss" onClick={onDismiss}>
        Got it
      </button>
    </div>
  )
}

/** The ninety-second floor: a five-minute drill actually done beats a longer one
    planned and skipped. Collapsed by default so it never competes with today's step. */
function MicroDrillPicker() {
  const [open, setOpen] = useState(false)
  const markMicroDrillDone = useAppStore((s) => s.markMicroDrillDone)

  if (!open) {
    return (
      <button type="button" className="card__shortcut" onClick={() => setOpen(true)}>
        Less than five minutes?
      </button>
    )
  }

  return (
    <div className="microDrills">
      <p className="microDrills__lede">Pick one — two minutes, nothing else changes.</p>
      <div className="microDrills__options">
        {curriculum.microDrills.map((drill) => (
          <button
            key={drill.id}
            type="button"
            className="microDrills__button"
            onClick={() => {
              markMicroDrillDone(drill.id)
              setOpen(false)
            }}
          >
            {drill.name}
          </button>
        ))}
      </div>
      <button type="button" className="card__shortcut" onClick={() => setOpen(false)}>
        Never mind
      </button>
    </div>
  )
}

function RisingStandardsCard({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="notice" role="status">
      <p className="notice__text">{RISING_STANDARDS_COPY}</p>
      <button type="button" className="notice__dismiss" onClick={onDismiss}>
        Got it
      </button>
    </div>
  )
}

/** Stays until checked — there's no reason to time-pressure something the user may do
    away from the app. Logs completion only: no image, no comparison, no result. */
function RedrawCard({ onComplete }: { onComplete: () => void }) {
  return (
    <div className="notice">
      <p className="notice__phase">Redraw set</p>
      <p className="notice__text">
        Draw all six again: {curriculum.redrawSubjects.map((s) => s.text).join(', ')}.
      </p>
      <p className="notice__text">
        Keep every attempt of each subject together in one place — a folder, a stack, a
        pinned wall — and compare them side by side on paper. That comparison is the
        only reliable way to see progress: your own sense of whether you're improving
        isn't trustworthy while your standards are rising faster than your skill.
      </p>
      <label className="notice__checkboxRow">
        <input
          type="checkbox"
          className="notice__checkbox"
          checked={false}
          onChange={onComplete}
        />
        <span>I've drawn all six and compared them</span>
      </label>
    </div>
  )
}

function phaseLabel(order: number): string {
  return `PHASE ${order}`
}
