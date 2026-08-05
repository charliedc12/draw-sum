import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { curriculum } from '../data/curriculum.ts'
import { findPhase } from '../logic/progression.ts'
import {
  DURATION_OPTIONS,
  currentStageIndex,
  elapsedMs,
  findSessionTemplate,
  formatElapsed,
  isTimerRunning,
} from '../logic/session.ts'
import { useAppStore } from '../store/useAppStore.ts'
import './Session.css'

/* The mileage half of the app. Drills build motor control here in short bursts;
   sessions build the ability to actually finish a drawing. Nothing here is timed
   against the user — the clock is a reference, never an authority. */
export default function Session() {
  const navigate = useNavigate()
  const state = useAppStore()
  const { hydrate, completeSession } = state
  // Captured at the moment of completion, since activeSession is cleared by
  // completeSession() — the tag list that follows still needs to know which phase the
  // just-finished session actually belonged to.
  const [completedPhaseId, setCompletedPhaseId] = useState<string | null>(null)

  useEffect(() => {
    hydrate()
  }, [hydrate])

  const currentPhase = findPhase(curriculum, state.currentPhaseId)

  if (!currentPhase) {
    return (
      <section className="screen">
        <h1 className="screen__title">Session</h1>
        <p>There's no phase to build a session for right now.</p>
      </section>
    )
  }

  if (completedPhaseId) {
    const completedPhase = findPhase(curriculum, completedPhaseId)
    return (
      <section className="screen">
        <h1 className="screen__title">Session</h1>
        {completedPhase && completedPhase.errorTags.length > 0 && (
          <TagPicker phase={completedPhase} onDone={() => navigate('/')} />
        )}
      </section>
    )
  }

  function handleComplete() {
    const sessionPhaseId = state.activeSession?.phaseId ?? state.currentPhaseId
    const errorTags = findPhase(curriculum, sessionPhaseId)?.errorTags ?? []
    completeSession()
    if (errorTags.length > 0) {
      setCompletedPhaseId(sessionPhaseId)
    } else {
      navigate('/')
    }
  }

  // The runner reflects the phase the session was actually generated for — not
  // necessarily the live current phase, in the edge case where the user jumps phases
  // while a session is still running.
  const sessionPhase = state.activeSession
    ? (findPhase(curriculum, state.activeSession.phaseId) ?? currentPhase)
    : currentPhase

  return (
    <section className="screen">
      <h1 className="screen__title">Session</h1>
      {state.activeSession ? (
        <SessionRunner phase={sessionPhase} onComplete={handleComplete} />
      ) : (
        <DurationPicker phaseId={currentPhase.id} />
      )}
    </section>
  )
}

function DurationPicker({ phaseId }: { phaseId: string }) {
  const beginSession = useAppStore((s) => s.beginSession)

  return (
    <div className="durationPicker">
      <p className="durationPicker__lede">How long do you have?</p>
      <div className="durationPicker__options">
        {DURATION_OPTIONS.map((minutes) => {
          const available = findSessionTemplate(curriculum, phaseId, minutes) !== undefined
          return (
            <button
              key={minutes}
              type="button"
              className="durationPicker__button"
              disabled={!available}
              onClick={() => beginSession(minutes)}
            >
              {minutes}
              <span className="durationPicker__unit">min</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function SessionRunner({
  phase,
  onComplete,
}: {
  phase: NonNullable<ReturnType<typeof findPhase>>
  onComplete: () => void
}) {
  const activeSession = useAppStore((s) => s.activeSession)
  const toggleStage = useAppStore((s) => s.toggleActiveSessionStage)
  const startTimer = useAppStore((s) => s.startActiveSessionTimer)
  const pauseTimer = useAppStore((s) => s.pauseActiveSessionTimer)
  const resumeTimer = useAppStore((s) => s.resumeActiveSessionTimer)
  const discardActiveSession = useAppStore((s) => s.discardActiveSession)

  // A tick to force a re-render each second while running — the elapsed VALUE is
  // always recomputed fresh from the stored wall-clock timestamps, never accumulated
  // by this interval, so a tab that gets suspended in the background and returns
  // reports the correct elapsed time immediately rather than a stale count.
  const [, setTick] = useState(0)
  const running = activeSession !== null && isTimerRunning(activeSession.timer)

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [running])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setTick((t) => t + 1)
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [])

  if (!activeSession) return null

  const template = findSessionTemplate(curriculum, activeSession.phaseId, activeSession.durationOption)
  const now = new Date()
  const ms = elapsedMs(activeSession.timer, now)
  const started = activeSession.timer.startedAt !== null
  const paused = activeSession.timer.pausedAt !== null
  const activeStage = started && template ? currentStageIndex(template, ms / 60_000) : -1

  return (
    <div className="runner">
      <p className="runner__breadcrumb">
        {phaseLabel(phase.order)} · SESSION · {activeSession.durationOption} MIN
      </p>

      <div className="subject">
        <p className="subject__label">
          {activeSession.subject.kind === 'fromLife' ? 'Draw, from life' : 'Draw, from reference'}
        </p>
        <p className="subject__text">{activeSession.subject.text}</p>
      </div>

      <div className="timer">
        <span className="timer__elapsed">{formatElapsed(ms)}</span>
        <div className="timer__controls">
          {!started && (
            <button type="button" className="timer__button timer__button--primary" onClick={startTimer}>
              Start
            </button>
          )}
          {running && (
            <button type="button" className="timer__button" onClick={pauseTimer}>
              Pause
            </button>
          )}
          {paused && (
            <button type="button" className="timer__button timer__button--primary" onClick={resumeTimer}>
              Resume
            </button>
          )}
        </div>
      </div>

      {template && (
        <ul className="stages">
          {template.stages.map((stage, index) => (
            <li
              key={stage.atMin}
              className="stages__item"
              data-current={index === activeStage}
            >
              <label className="stages__label">
                <input
                  type="checkbox"
                  className="stages__checkbox"
                  checked={activeSession.checkedStageIndices.includes(index)}
                  onChange={() => toggleStage(index)}
                />
                <span className="stages__atMin">{stage.atMin} min</span>
                <span className="stages__instruction">{stage.instruction}</span>
              </label>
            </li>
          ))}
        </ul>
      )}

      <div className="actions">
        <button type="button" className="actions__button actions__button--primary" onClick={onComplete}>
          Session complete
        </button>
      </div>

      <button type="button" className="runner__discard" onClick={discardActiveSession}>
        Start a different session
      </button>
    </div>
  )
}

function TagPicker({
  phase,
  onDone,
}: {
  phase: NonNullable<ReturnType<typeof findPhase>>
  onDone: () => void
}) {
  const tagLastSession = useAppStore((s) => s.tagLastSession)
  const [selected, setSelected] = useState<string[]>([])

  function toggle(tag: string) {
    setSelected((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    )
  }

  return (
    <div className="tagPicker">
      <p className="tagPicker__lede">
        Anything you noticed? Entirely optional — pick as many or as few as apply.
      </p>
      <ul className="tagPicker__list">
        {phase.errorTags.map((tag) => (
          <li key={tag} className="tagPicker__item">
            <label className="tagPicker__label">
              <input
                type="checkbox"
                className="tagPicker__checkbox"
                checked={selected.includes(tag)}
                onChange={() => toggle(tag)}
              />
              <span className="tagPicker__text">{tag}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="actions">
        <button
          type="button"
          className="actions__button actions__button--secondary"
          onClick={onDone}
        >
          Skip
        </button>
        <button
          type="button"
          className="actions__button actions__button--secondary"
          onClick={() => {
            tagLastSession(selected)
            onDone()
          }}
        >
          Save
        </button>
      </div>
    </div>
  )
}

function phaseLabel(order: number): string {
  return `PHASE ${order}`
}
