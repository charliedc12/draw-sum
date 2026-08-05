/* Pure progression rules. No store imports, no I/O, no Date.now() reached for
   implicitly — callers pass `now`. Everything here takes state and returns new state.

   The governing rule: nothing in this file may penalise a missed day. There is no
   streak, no decay, no reset-on-gap. A gap is simply time in which nothing happened. */

import type { Curriculum, Phase, Step, Unit } from '../types/curriculum.ts'

/** Drills owed before the app asks for a longer session instead of another drill. */
export const DEBT_THRESHOLD = 10

/** Skips of one step before its alternate (if any) is offered as a swap. */
export const SKIPS_BEFORE_ALTERNATE = 3

export type LogEntry = {
  id: string
  targetId: string
  targetKind: 'step' | 'session'
  date: string
  status: 'done' | 'skipped'
}

export type ProgressState = {
  currentPhaseId: string
  phaseEntryDate: string
  currentUnitId: string
  unitRepCounts: Record<string, number>
  stepCompletionCounts: Record<string, number>
  stepSkipCounts: Record<string, number>
  drillCount: number
  sessionCount: number
  debtCounter: number
  gateTicks: Record<string, boolean[]>
  log: LogEntry[]
  /** Set when a phase advanced on the clock rather than on the gate. UI explains it. */
  forcedAdvance: boolean
}

export type TodayView = { phaseOverdue: boolean } & (
  | {
      kind: 'step'
      phase: Phase
      unit: Unit
      step: Step
      /** 1-based position within the unit's stepIds, for the breadcrumb. */
      stepNumber: number
      stepCount: number
      /** Present once the step has been skipped enough times and declares one. */
      alternate?: Step
    }
  | {
      kind: 'session'
      reason: 'debt'
      phase: Phase
      /** The phase's weekend unit, when it has one — the session's actual content. */
      unit?: Unit
      steps: Step[]
      drillsOwed: number
    }
  | { kind: 'gate'; phase: Phase }
  | { kind: 'empty' }
)

// ---- lookups ---------------------------------------------------------------

export function findPhase(curriculum: Curriculum, phaseId: string): Phase | undefined {
  return curriculum.phases.find((p) => p.id === phaseId)
}

export function findUnit(curriculum: Curriculum, unitId: string): Unit | undefined {
  return curriculum.units.find((u) => u.id === unitId)
}

export function findStep(curriculum: Curriculum, stepId: string): Step | undefined {
  return curriculum.steps.find((s) => s.id === stepId)
}

function unitsOfPhase(curriculum: Curriculum, phase: Phase): Unit[] {
  return phase.unitIds
    .map((id) => findUnit(curriculum, id))
    .filter((u): u is Unit => u !== undefined)
}

function stepsOfUnit(curriculum: Curriculum, unit: Unit): Step[] {
  return unit.stepIds
    .map((id) => findStep(curriculum, id))
    .filter((s): s is Step => s !== undefined)
}

// ---- time ------------------------------------------------------------------

const MS_PER_DAY = 86_400_000

/** Whole days elapsed. Never used to punish — only to cap how long a phase can run. */
export function daysSince(iso: string, now: Date): number {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 0
  return Math.max(0, Math.floor((now.getTime() - then) / MS_PER_DAY))
}

export function isPhaseOverdue(
  state: ProgressState,
  curriculum: Curriculum,
  now: Date,
): boolean {
  const phase = findPhase(curriculum, state.currentPhaseId)
  if (!phase) return false
  return daysSince(state.phaseEntryDate, now) >= phase.maxWeeks * 7
}

// ---- unit and gate status --------------------------------------------------

export function isUnitClosed(state: ProgressState, unit: Unit): boolean {
  return (state.unitRepCounts[unit.id] ?? 0) >= unit.requiredReps
}

/** The gate opens once every daily unit in the phase has met its reps. */
export function isGateReady(state: ProgressState, curriculum: Curriculum): boolean {
  const phase = findPhase(curriculum, state.currentPhaseId)
  if (!phase) return false
  const daily = unitsOfPhase(curriculum, phase).filter((u) => u.kind === 'daily')
  return daily.length > 0 && daily.every((u) => isUnitClosed(state, u))
}

/**
 * The unit whose steps get served today: the current one while it's still open,
 * otherwise the first open daily unit in the phase. Recovering the pointer here means
 * a curriculum edit or a stale save can't strand somebody on a finished unit.
 */
export function getServingUnit(
  state: ProgressState,
  curriculum: Curriculum,
): Unit | undefined {
  const phase = findPhase(curriculum, state.currentPhaseId)
  if (!phase) return undefined
  const daily = unitsOfPhase(curriculum, phase).filter((u) => u.kind === 'daily')

  const current = findUnit(curriculum, state.currentUnitId)
  if (current && current.phaseId === phase.id && current.kind === 'daily') {
    if (!isUnitClosed(state, current)) return current
  }
  return daily.find((u) => !isUnitClosed(state, u))
}

/** The next daily unit after this one, in the phase's own order. */
function nextDailyUnit(
  curriculum: Curriculum,
  phase: Phase,
  afterUnitId: string,
): Unit | undefined {
  const daily = unitsOfPhase(curriculum, phase).filter((u) => u.kind === 'daily')
  const index = daily.findIndex((u) => u.id === afterUnitId)
  if (index === -1) return daily[0]
  return daily[index + 1]
}

function weekendUnit(curriculum: Curriculum, phase: Phase): Unit | undefined {
  return unitsOfPhase(curriculum, phase).find((u) => u.kind === 'weekend')
}

// ---- serving ---------------------------------------------------------------

/**
 * Round-robin order for a unit: fewest completions first, then fewest skips, then the
 * step's own position in stepIds.
 *
 * The skip tiebreak is what makes SKIP serve something new — a skip leaves completions
 * untouched (by design, it is not progress), so without it the same step would come
 * straight back.
 */
export function orderStepsForUnit(
  state: ProgressState,
  curriculum: Curriculum,
  unit: Unit,
): Step[] {
  return stepsOfUnit(curriculum, unit)
    .map((step, index) => ({ step, index }))
    .sort((a, b) => {
      const doneA = state.stepCompletionCounts[a.step.id] ?? 0
      const doneB = state.stepCompletionCounts[b.step.id] ?? 0
      if (doneA !== doneB) return doneA - doneB

      const skipA = state.stepSkipCounts[a.step.id] ?? 0
      const skipB = state.stepSkipCounts[b.step.id] ?? 0
      if (skipA !== skipB) return skipA - skipB

      return a.index - b.index
    })
    .map((entry) => entry.step)
}

/** True once a step has been skipped enough times and offers somewhere else to go. */
export function shouldOfferAlternate(state: ProgressState, step: Step): boolean {
  if (!step.alternateStepId) return false
  return (state.stepSkipCounts[step.id] ?? 0) >= SKIPS_BEFORE_ALTERNATE
}

/**
 * What to put on the Today screen.
 *
 * Precedence: debt outranks everything (the session is the thing being avoided), then
 * the gate, then the next drill.
 */
export function getTodayStep(
  state: ProgressState,
  curriculum: Curriculum,
  now: Date = new Date(),
): TodayView {
  const phaseOverdue = isPhaseOverdue(state, curriculum, now)
  const phase = findPhase(curriculum, state.currentPhaseId)
  if (!phase) return { kind: 'empty', phaseOverdue }

  if (state.debtCounter >= DEBT_THRESHOLD) {
    const unit = weekendUnit(curriculum, phase)
    return {
      kind: 'session',
      reason: 'debt',
      phase,
      unit,
      steps: unit ? stepsOfUnit(curriculum, unit) : [],
      drillsOwed: state.debtCounter,
      phaseOverdue,
    }
  }

  if (isGateReady(state, curriculum)) return { kind: 'gate', phase, phaseOverdue }

  const unit = getServingUnit(state, curriculum)
  if (!unit) return { kind: 'empty', phaseOverdue }

  const step = orderStepsForUnit(state, curriculum, unit)[0]
  if (!step) return { kind: 'empty', phaseOverdue }

  const alternate = shouldOfferAlternate(state, step)
    ? findStep(curriculum, step.alternateStepId!)
    : undefined

  return {
    kind: 'step',
    phase,
    unit,
    step,
    stepNumber: unit.stepIds.indexOf(step.id) + 1,
    stepCount: unit.stepIds.length,
    alternate,
    phaseOverdue,
  }
}

// ---- transitions -----------------------------------------------------------

function makeLogEntry(
  state: ProgressState,
  targetId: string,
  targetKind: LogEntry['targetKind'],
  status: LogEntry['status'],
  now: Date,
): LogEntry {
  return {
    id: `${targetKind}-${targetId}-${now.getTime()}-${state.log.length}`,
    targetId,
    targetKind,
    date: now.toISOString(),
    status,
  }
}

function bump(counts: Record<string, number>, key: string): Record<string, number> {
  return { ...counts, [key]: (counts[key] ?? 0) + 1 }
}

/**
 * A completed drill. Credits the step, the unit, the lifetime drill count and the
 * session debt, then closes the unit and moves the pointer on if the reps are met.
 */
export function markStepDone(
  state: ProgressState,
  curriculum: Curriculum,
  stepId: string,
  now: Date = new Date(),
): ProgressState {
  const step = findStep(curriculum, stepId)
  if (!step) return state

  // Credit the unit that owns the step, so a swapped-in alternate still counts.
  const unitId = findUnit(curriculum, step.unitId) ? step.unitId : state.currentUnitId
  const unitRepCounts = bump(state.unitRepCounts, unitId)

  let currentUnitId = state.currentUnitId
  const unit = findUnit(curriculum, unitId)
  const phase = findPhase(curriculum, state.currentPhaseId)
  if (unit && phase && unitRepCounts[unitId] >= unit.requiredReps) {
    const next = nextDailyUnit(curriculum, phase, unitId)
    if (next) currentUnitId = next.id
  }

  return {
    ...state,
    stepCompletionCounts: bump(state.stepCompletionCounts, stepId),
    unitRepCounts,
    currentUnitId,
    drillCount: state.drillCount + 1,
    debtCounter: state.debtCounter + 1,
    log: [...state.log, makeLogEntry(state, stepId, 'step', 'done', now)],
  }
}

/**
 * A skip. Deliberately worth nothing in either direction: no reps, no drill count, no
 * debt. It records that the step was passed over so a different one comes up next.
 */
export function markStepSkipped(
  state: ProgressState,
  curriculum: Curriculum,
  stepId: string,
  now: Date = new Date(),
): ProgressState {
  if (!findStep(curriculum, stepId)) return state

  return {
    ...state,
    stepSkipCounts: bump(state.stepSkipCounts, stepId),
    log: [...state.log, makeLogEntry(state, stepId, 'step', 'skipped', now)],
  }
}

/**
 * A finished long session. Clears the debt, and credits the phase's weekend unit so
 * weekend reps track the same way daily reps do.
 */
export function completeSession(
  state: ProgressState,
  curriculum: Curriculum,
  now: Date = new Date(),
): ProgressState {
  const phase = findPhase(curriculum, state.currentPhaseId)
  const unit = phase ? weekendUnit(curriculum, phase) : undefined
  const targetId = unit?.id ?? state.currentPhaseId

  return {
    ...state,
    debtCounter: 0,
    sessionCount: state.sessionCount + 1,
    unitRepCounts: unit ? bump(state.unitRepCounts, unit.id) : state.unitRepCounts,
    log: [...state.log, makeLogEntry(state, targetId, 'session', 'done', now)],
  }
}

export function tickGate(
  state: ProgressState,
  curriculum: Curriculum,
  phaseId: string,
  index: number,
  value: boolean,
): ProgressState {
  const phase = findPhase(curriculum, phaseId)
  if (!phase) return state
  if (index < 0 || index >= phase.gateStatements.length) return state

  const ticks = [...(state.gateTicks[phaseId] ?? phase.gateStatements.map(() => false))]
  ticks[index] = value

  return { ...state, gateTicks: { ...state.gateTicks, [phaseId]: ticks } }
}

function firstDailyUnitId(curriculum: Curriculum, phase: Phase): string {
  const daily = unitsOfPhase(curriculum, phase).filter((u) => u.kind === 'daily')
  return daily[0]?.id ?? phase.unitIds[0] ?? ''
}

/**
 * Point the state at a phase. Never touches rep or completion counts — moving around
 * the curriculum is navigation, not a reset.
 */
export function setPhase(
  state: ProgressState,
  curriculum: Curriculum,
  phaseId: string,
  now: Date = new Date(),
  options: { forced?: boolean } = {},
): ProgressState {
  const phase = findPhase(curriculum, phaseId)
  if (!phase) return state

  return {
    ...state,
    currentPhaseId: phase.id,
    currentUnitId: firstDailyUnitId(curriculum, phase),
    phaseEntryDate: now.toISOString(),
    forcedAdvance: options.forced ?? false,
  }
}

/** Move to the next phase by order. Last phase stays put. */
export function advancePhase(
  state: ProgressState,
  curriculum: Curriculum,
  now: Date = new Date(),
  options: { forced?: boolean } = {},
): ProgressState {
  const phase = findPhase(curriculum, state.currentPhaseId)
  if (!phase) return state

  const next = curriculum.phases
    .filter((p) => p.order > phase.order)
    .sort((a, b) => a.order - b.order)[0]
  if (!next) return state

  return setPhase(state, curriculum, next.id, now, options)
}

/**
 * The clock cap. Sitting in a phase past its maxWeeks advances it whether or not the
 * gate was ticked — the point is to keep people moving, so `forcedAdvance` is set for
 * the UI to explain what happened rather than let it look like a bug.
 */
export function applyForcedAdvance(
  state: ProgressState,
  curriculum: Curriculum,
  now: Date = new Date(),
): ProgressState {
  if (!isPhaseOverdue(state, curriculum, now)) return state
  return advancePhase(state, curriculum, now, { forced: true })
}

/** Starting state for somebody who has never opened the app. */
export function initialProgress(curriculum: Curriculum, now: Date = new Date()): ProgressState {
  const phase = [...curriculum.phases].sort((a, b) => a.order - b.order)[0]
  return {
    currentPhaseId: phase?.id ?? '',
    phaseEntryDate: now.toISOString(),
    currentUnitId: phase ? firstDailyUnitId(curriculum, phase) : '',
    unitRepCounts: {},
    stepCompletionCounts: {},
    stepSkipCounts: {},
    drillCount: 0,
    sessionCount: 0,
    debtCounter: 0,
    gateTicks: {},
    log: [],
    forcedAdvance: false,
  }
}
