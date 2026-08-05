/* Pure logic for a weekend session: which template to run, what subject to draw, and
   a timer whose elapsed time is always recomputed from wall-clock timestamps rather
   than accumulated by an interval — the only way it survives iOS Safari suspending a
   backgrounded tab. No store imports, no component state. */

import type { Curriculum, DurationOption, Reference, SessionTemplate } from '../types/curriculum.ts'

export const DURATION_OPTIONS: DurationOption[] = [30, 45, 60]

export function findSessionTemplate(
  curriculum: Curriculum,
  phaseId: string,
  durationOption: DurationOption,
): SessionTemplate | undefined {
  return curriculum.sessionTemplates.find(
    (t) => t.phaseId === phaseId && t.durationOption === durationOption,
  )
}

/** The stage whose atMin is the latest one at or before `elapsedMin` — "which stage are we in." */
export function currentStageIndex(template: SessionTemplate, elapsedMin: number): number {
  let index = 0
  for (let i = 0; i < template.stages.length; i++) {
    if (template.stages[i].atMin <= elapsedMin) index = i
    else break
  }
  return index
}

export type SessionSubject = {
  kind: 'fromLife' | 'reference'
  text: string
}

/**
 * One subject for the whole session, drawn from the phase's reference pool (the
 * "subject" and "fromLifePrompt" categories written for docs/CURRICULUM.md). Picked
 * once by the caller and held in state — re-deriving it on every render would make the
 * displayed subject flicker between renders.
 */
export function pickSessionSubject(
  curriculum: Curriculum,
  phaseId: string,
  random: () => number = Math.random,
): SessionSubject | undefined {
  const pool = curriculum.references.filter((r) => r.phaseId === phaseId)
  if (pool.length === 0) return undefined
  const picked: Reference = pool[Math.floor(random() * pool.length)]
  return { kind: picked.fromLife ? 'fromLife' : 'reference', text: picked.subject }
}

// ---- the wall-clock timer ---------------------------------------------------

/**
 * A soft reference timer, not an authority: nothing auto-advances or auto-completes
 * from it. `startedAt` and `pausedAt` are wall-clock timestamps, so elapsed time is
 * always recomputed fresh from `now` — a backgrounded tab that gets its interval
 * suspended (or the whole page reloaded) still reports the correct elapsed time the
 * moment it's asked again.
 */
export type SessionTimer = {
  startedAt: string | null
  pausedAt: string | null
  /** Total milliseconds already spent paused, across all earlier pause/resume cycles. */
  accumulatedPauseMs: number
}

export function initialTimer(): SessionTimer {
  return { startedAt: null, pausedAt: null, accumulatedPauseMs: 0 }
}

export function startTimer(now: Date): SessionTimer {
  return { startedAt: now.toISOString(), pausedAt: null, accumulatedPauseMs: 0 }
}

export function pauseTimer(timer: SessionTimer, now: Date): SessionTimer {
  if (!timer.startedAt || timer.pausedAt) return timer
  return { ...timer, pausedAt: now.toISOString() }
}

export function resumeTimer(timer: SessionTimer, now: Date): SessionTimer {
  if (!timer.pausedAt) return timer
  const pausedFor = now.getTime() - new Date(timer.pausedAt).getTime()
  return {
    startedAt: timer.startedAt,
    pausedAt: null,
    accumulatedPauseMs: timer.accumulatedPauseMs + pausedFor,
  }
}

export function isTimerRunning(timer: SessionTimer): boolean {
  return timer.startedAt !== null && timer.pausedAt === null
}

/**
 * Elapsed milliseconds, computed fresh from wall-clock timestamps every time — never
 * from a counter that ticked while the tab was backgrounded. Zero before the timer is
 * started; frozen at whatever it was the moment a pause began.
 */
export function elapsedMs(timer: SessionTimer, now: Date): number {
  if (!timer.startedAt) return 0
  const start = new Date(timer.startedAt).getTime()
  const activePauseMs = timer.pausedAt
    ? now.getTime() - new Date(timer.pausedAt).getTime()
    : 0
  const elapsed = now.getTime() - start - timer.accumulatedPauseMs - activePauseMs
  return Math.max(0, elapsed)
}

export function elapsedMinutes(timer: SessionTimer, now: Date): number {
  return elapsedMs(timer, now) / 60_000
}

/** "12:04" below an hour, "1:02:04" at or beyond one. */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}

// ---- the staged session itself ----------------------------------------------

/**
 * A generated, in-progress session: which template it's running, the subject drawn
 * for it, which stage checkboxes are ticked, and the timer. Persisted as part of
 * ProgressState (see progression.ts) so it survives a full page reload, not just a
 * backgrounded tab.
 */
export type ActiveSession = {
  phaseId: string
  durationOption: DurationOption
  subject: SessionSubject
  checkedStageIndices: number[]
  timer: SessionTimer
}

/** Undefined if the phase has no session template or reference pool for this duration. */
export function createActiveSession(
  curriculum: Curriculum,
  phaseId: string,
  durationOption: DurationOption,
  random: () => number = Math.random,
): ActiveSession | undefined {
  const template = findSessionTemplate(curriculum, phaseId, durationOption)
  if (!template) return undefined
  const subject = pickSessionSubject(curriculum, phaseId, random)
  if (!subject) return undefined
  return { phaseId, durationOption, subject, checkedStageIndices: [], timer: initialTimer() }
}

/** Stage checkboxes are purely informational — toggling never gates completion. */
export function toggleStage(session: ActiveSession, index: number): ActiveSession {
  const checked = session.checkedStageIndices.includes(index)
  return {
    ...session,
    checkedStageIndices: checked
      ? session.checkedStageIndices.filter((i) => i !== index)
      : [...session.checkedStageIndices, index].sort((a, b) => a - b),
  }
}
