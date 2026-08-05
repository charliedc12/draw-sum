/* Pure progression rules. No store imports, no I/O, no Date.now() reached for
   implicitly — callers pass `now`. Everything here takes state and returns new state.

   The governing rule: nothing in this file may penalise a missed day. There is no
   streak, no decay, no reset-on-gap. A gap is simply time in which nothing happened. */

import type { Curriculum, DurationOption, Phase, Step, Unit } from '../types/curriculum.ts'
import type { ActiveSession, SessionTimer } from './session.ts'
import * as session from './session.ts'

/** Drills owed before the app asks for a longer session instead of another drill. */
export const DEBT_THRESHOLD = 10

/** Skips of one step before its alternate (if any) is offered as a swap. */
export const SKIPS_BEFORE_ALTERNATE = 3

/** How long a gate top-up keeps reinjecting its units before falling back to the gate. */
export const TOP_UP_DAYS = 14

/**
 * Applied to a weekend session's log entry when the drawing's overall proportions came
 * apart. Its value matches the "proportions collapsed" option in the Phase 4, 5 and 6
 * error-tag lists (src/data/curriculum.json) verbatim — the regression check reads
 * whatever the session-completion screen actually writes, not a separate slug.
 */
export const PROPORTION_COLLAPSED_TAG = 'proportions collapsed'

/** Earliest phase order at which a proportion regression is watched for. */
export const REGRESSION_MIN_PHASE_ORDER = 4
/** The unit reinjected when a regression is detected — Phase 2's Measuring drills. */
export const REGRESSION_UNIT_ID = 'u2.3'
/** How many of the most recent sessions are considered. */
export const REGRESSION_WINDOW = 5
/** How many tagged sessions within the window trigger reinjection. */
export const REGRESSION_THRESHOLD = 3

export type LogEntry = {
  id: string
  targetId: string
  targetKind: 'step' | 'session'
  date: string
  status: 'done' | 'skipped'
  /**
   * Error tags picked on a weekend session's completion screen (see Session.tsx). The
   * only downstream uses are drill weighting and the soft-regression check above —
   * never a score, grade, trend, or anything shown back to the user as an assessment.
   */
  tags?: string[]
}

/** An active top-up: extra reps on specific units, kept alive for TOP_UP_DAYS. */
export type TopUp = {
  phaseId: string
  /** Indices into that phase's gateStatements — the ones left unticked when requested. */
  statementIndices: number[]
  startedAt: string
  expiresAt: string
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
  topUp: TopUp | null
  /** The in-progress weekend session, if any. Persisted so it survives a full reload. */
  activeSession: ActiveSession | null
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
      /** Set only when the step's own phase differs from the phase the user is in. */
      supportingNote?: string
    }
  | {
      /** A nudge, not the session itself — routes to /session, the only page in the
          app that blocks the user's normal flow. */
      kind: 'session'
      reason: 'debt'
      phase: Phase
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
 * Round-robin order across one or more units: fewest completions first, then fewest
 * skips, then a stable position — the unit's own place in the given list, then the
 * step's place within that unit.
 *
 * The skip tiebreak is what makes SKIP serve something new — a skip leaves completions
 * untouched (by design, it is not progress), so without it the same step would come
 * straight back.
 */
export function orderStepsAcrossUnits(
  state: ProgressState,
  curriculum: Curriculum,
  units: Unit[],
): Step[] {
  return units
    .flatMap((unit, unitIndex) =>
      stepsOfUnit(curriculum, unit).map((step, stepIndex) => ({ step, unitIndex, stepIndex })),
    )
    .sort((a, b) => {
      const doneA = state.stepCompletionCounts[a.step.id] ?? 0
      const doneB = state.stepCompletionCounts[b.step.id] ?? 0
      if (doneA !== doneB) return doneA - doneB

      const skipA = state.stepSkipCounts[a.step.id] ?? 0
      const skipB = state.stepSkipCounts[b.step.id] ?? 0
      if (skipA !== skipB) return skipA - skipB

      if (a.unitIndex !== b.unitIndex) return a.unitIndex - b.unitIndex
      return a.stepIndex - b.stepIndex
    })
    .map((entry) => entry.step)
}

/** Round-robin order for a single unit. A thin wrapper over the multi-unit version. */
export function orderStepsForUnit(
  state: ProgressState,
  curriculum: Curriculum,
  unit: Unit,
): Step[] {
  return orderStepsAcrossUnits(state, curriculum, [unit])
}

/** True once a step has been skipped enough times and offers somewhere else to go. */
export function shouldOfferAlternate(state: ProgressState, step: Step): boolean {
  if (!step.alternateStepId) return false
  return (state.stepSkipCounts[step.id] ?? 0) >= SKIPS_BEFORE_ALTERNATE
}

function dedupeUnitsById(units: Unit[]): Unit[] {
  const seen = new Set<string>()
  const out: Unit[] = []
  for (const unit of units) {
    if (seen.has(unit.id)) continue
    seen.add(unit.id)
    out.push(unit)
  }
  return out
}

// ---- gate top-up -------------------------------------------------------------

/** Indices of this phase's gate statements that aren't currently ticked. */
export function getUntickedStatementIndices(
  state: ProgressState,
  curriculum: Curriculum,
  phaseId: string,
): number[] {
  const phase = findPhase(curriculum, phaseId)
  if (!phase) return []
  const ticks = state.gateTicks[phaseId] ?? phase.gateStatements.map(() => false)
  return phase.gateStatements.map((_, index) => index).filter((index) => !ticks[index])
}

/**
 * Starts (or restarts) a top-up on the current phase's unticked statements. A no-op if
 * everything is already ticked — there is nothing to top up.
 */
export function startTopUp(
  state: ProgressState,
  curriculum: Curriculum,
  now: Date = new Date(),
): ProgressState {
  const statementIndices = getUntickedStatementIndices(state, curriculum, state.currentPhaseId)
  if (statementIndices.length === 0) return state

  const expiresAt = new Date(now.getTime() + TOP_UP_DAYS * MS_PER_DAY).toISOString()
  return {
    ...state,
    topUp: {
      phaseId: state.currentPhaseId,
      statementIndices,
      startedAt: now.toISOString(),
      expiresAt,
    },
  }
}

/** A top-up counts only while it's for the phase the user is currently in, and unexpired. */
export function isTopUpActive(
  state: ProgressState,
  curriculum: Curriculum,
  now: Date = new Date(),
): boolean {
  const topUp = state.topUp
  if (!topUp) return false
  if (topUp.phaseId !== state.currentPhaseId) return false
  if (!findPhase(curriculum, topUp.phaseId)) return false
  return now.getTime() < new Date(topUp.expiresAt).getTime()
}

/** The units an active top-up reinjects — assembled from its stored statement indices. */
export function getTopUpUnitIds(
  state: ProgressState,
  curriculum: Curriculum,
  now: Date = new Date(),
): string[] {
  if (!isTopUpActive(state, curriculum, now)) return []
  const phase = findPhase(curriculum, state.currentPhaseId)
  const topUp = state.topUp
  if (!phase || !topUp) return []

  const ids = new Set<string>()
  for (const index of topUp.statementIndices) {
    const statement = phase.gateStatements[index]
    if (!statement) continue
    for (const unitId of statement.statementUnitIds) ids.add(unitId)
  }
  return [...ids]
}

// ---- soft regression -----------------------------------------------------------

/**
 * Three of the last five (or fewer, if there haven't been five yet) weekend sessions
 * tagged with a collapsed-proportion error, while in Phase 4 or later. This never
 * changes currentPhaseId or resets anything — see [[getRegressionUnitIds]].
 */
export function isSoftRegressionActive(
  state: ProgressState,
  curriculum: Curriculum,
): boolean {
  const phase = findPhase(curriculum, state.currentPhaseId)
  if (!phase || phase.order < REGRESSION_MIN_PHASE_ORDER) return false

  const recentSessions = state.log
    .filter((entry) => entry.targetKind === 'session' && entry.status === 'done')
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, REGRESSION_WINDOW)

  const tagged = recentSessions.filter((entry) =>
    entry.tags?.includes(PROPORTION_COLLAPSED_TAG),
  ).length

  return tagged >= REGRESSION_THRESHOLD
}

/** The earlier-phase unit reinjected into today's rotation while regression is active. */
export function getRegressionUnitIds(state: ProgressState, curriculum: Curriculum): string[] {
  if (!isSoftRegressionActive(state, curriculum)) return []
  return findUnit(curriculum, REGRESSION_UNIT_ID) ? [REGRESSION_UNIT_ID] : []
}

/**
 * Units layered on top of the normal daily unit: an active gate top-up, and/or an
 * active soft-regression reinjection. Phases layer, they never replace — nothing here
 * touches currentPhaseId or any counter.
 */
export function getSupplementalUnits(
  state: ProgressState,
  curriculum: Curriculum,
  now: Date = new Date(),
): Unit[] {
  const ids = [
    ...getTopUpUnitIds(state, curriculum, now),
    ...getRegressionUnitIds(state, curriculum),
  ]
  return dedupeUnitsById(
    ids.map((id) => findUnit(curriculum, id)).filter((u): u is Unit => u !== undefined),
  )
}

// ---- classification (for the Path tree) ------------------------------------

/**
 * Three states, and only three: everything on the Path screen is one of these. Future
 * phases and units always render — 'upcoming' is a display state, never a lock.
 */
export type Classification = 'completed' | 'current' | 'upcoming'

export function classifyPhase(
  state: ProgressState,
  curriculum: Curriculum,
  phase: Phase,
): Classification {
  const active = findPhase(curriculum, state.currentPhaseId)
  if (!active) return 'upcoming'
  if (phase.order < active.order) return 'completed'
  if (phase.order === active.order) return 'current'
  return 'upcoming'
}

/**
 * A weekend unit has no round-robin pointer to be "next" in, so it counts as current
 * whenever its phase is active and it isn't closed yet — it's always available, not
 * gated behind the daily units.
 */
export function classifyUnit(
  state: ProgressState,
  curriculum: Curriculum,
  unit: Unit,
): Classification {
  if (isUnitClosed(state, unit)) return 'completed'
  if (unit.phaseId !== state.currentPhaseId) return 'upcoming'
  if (unit.kind === 'weekend') return 'current'
  return getServingUnit(state, curriculum)?.id === unit.id ? 'current' : 'upcoming'
}

/** The units getTodayStep serves from right now: the open daily unit plus any top-up or regression units. */
function servingUnitsForToday(
  state: ProgressState,
  curriculum: Curriculum,
  now: Date,
): Unit[] {
  const primary = getServingUnit(state, curriculum)
  const supplemental = getSupplementalUnits(state, curriculum, now)
  return dedupeUnitsById(primary ? [primary, ...supplemental] : supplemental)
}

/** The step getTodayStep would hand out right now, independent of debt or the gate. */
export function getCurrentStepId(
  state: ProgressState,
  curriculum: Curriculum,
  now: Date = new Date(),
): string | undefined {
  const units = servingUnitsForToday(state, curriculum, now)
  return orderStepsAcrossUnits(state, curriculum, units)[0]?.id
}

/**
 * A step reads as 'completed' once it has a single completion, even though a unit
 * cycles through its steps repeatedly to reach requiredReps — "filled" means "you've
 * done this," not "you'll never see it again."
 */
export function classifyStep(
  state: ProgressState,
  curriculum: Curriculum,
  step: Step,
  now: Date = new Date(),
): Classification {
  if ((state.stepCompletionCounts[step.id] ?? 0) > 0) return 'completed'
  if (step.id === getCurrentStepId(state, curriculum, now)) return 'current'
  return 'upcoming'
}

/**
 * What to put on the Today screen.
 *
 * Precedence: debt outranks everything (the session is the thing being avoided), then
 * the gate — unless a top-up is active, in which case the top-up's units take the
 * gate's place until it expires — then the next drill, which may be blended with
 * top-up or soft-regression units on top of the phase's own serving unit.
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
    return { kind: 'session', reason: 'debt', phase, drillsOwed: state.debtCounter, phaseOverdue }
  }

  const gateReady = isGateReady(state, curriculum)
  const topUpActive = isTopUpActive(state, curriculum, now)
  if (gateReady && !topUpActive) return { kind: 'gate', phase, phaseOverdue }

  const units = servingUnitsForToday(state, curriculum, now)
  if (units.length === 0) return { kind: 'empty', phaseOverdue }

  const step = orderStepsAcrossUnits(state, curriculum, units)[0]
  if (!step) return { kind: 'empty', phaseOverdue }

  // The step's own unit and phase, not necessarily the phase the user is "in" — a
  // regression step genuinely is Phase 2 content, shown honestly as Phase 2 content.
  const stepUnit = findUnit(curriculum, step.unitId)
  const stepPhase = (stepUnit && findPhase(curriculum, stepUnit.phaseId)) ?? phase
  if (!stepUnit) return { kind: 'empty', phaseOverdue }

  const alternate = shouldOfferAlternate(state, step)
    ? findStep(curriculum, step.alternateStepId!)
    : undefined

  const supportingNote =
    stepPhase.id !== phase.id
      ? `Supporting drill from Phase ${stepPhase.order} — ${stepPhase.name}.`
      : undefined

  return {
    kind: 'step',
    phase: stepPhase,
    unit: stepUnit,
    step,
    stepNumber: stepUnit.stepIds.indexOf(step.id) + 1,
    stepCount: stepUnit.stepIds.length,
    alternate,
    supportingNote,
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
 * A finished long session. Clears the debt and the in-progress session state, and
 * credits the phase's weekend unit so weekend reps track the same way daily reps do.
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
    activeSession: null,
  }
}

/**
 * Attaches error tags to the most recently completed session's log entry. Called after
 * `completeSession`, once the user has picked (or skipped) tags on the follow-up
 * screen — the entry already exists, tagging is a separate, optional step onto it.
 *
 * These tags feed exactly two things: future drill weighting, and the soft-regression
 * check above. They are never turned into a score, a grade, a trend, or shown back to
 * the user as any kind of assessment.
 */
export function tagLastSession(state: ProgressState, tags: string[]): ProgressState {
  if (tags.length === 0) return state

  const lastSessionIndex = state.log.reduce(
    (found, entry, index) => (entry.targetKind === 'session' ? index : found),
    -1,
  )
  if (lastSessionIndex === -1) return state

  const log = [...state.log]
  log[lastSessionIndex] = { ...log[lastSessionIndex], tags }
  return { ...state, log }
}

// ---- the active session (Session.tsx) ---------------------------------------

/** Generates a staged session for the current phase. A no-op if none exists. */
export function beginSession(
  state: ProgressState,
  curriculum: Curriculum,
  durationOption: DurationOption,
  random: () => number = Math.random,
): ProgressState {
  const activeSession = session.createActiveSession(
    curriculum,
    state.currentPhaseId,
    durationOption,
    random,
  )
  if (!activeSession) return state
  return { ...state, activeSession }
}

/** Discards the in-progress session without completing it. Nothing else is touched. */
export function discardActiveSession(state: ProgressState): ProgressState {
  return { ...state, activeSession: null }
}

export function toggleActiveSessionStage(state: ProgressState, index: number): ProgressState {
  if (!state.activeSession) return state
  return { ...state, activeSession: session.toggleStage(state.activeSession, index) }
}

export function startActiveSessionTimer(
  state: ProgressState,
  now: Date = new Date(),
): ProgressState {
  if (!state.activeSession) return state
  return { ...state, activeSession: { ...state.activeSession, timer: session.startTimer(now) } }
}

export function pauseActiveSessionTimer(
  state: ProgressState,
  now: Date = new Date(),
): ProgressState {
  if (!state.activeSession) return state
  const timer: SessionTimer = session.pauseTimer(state.activeSession.timer, now)
  return { ...state, activeSession: { ...state.activeSession, timer } }
}

export function resumeActiveSessionTimer(
  state: ProgressState,
  now: Date = new Date(),
): ProgressState {
  if (!state.activeSession) return state
  const timer: SessionTimer = session.resumeTimer(state.activeSession.timer, now)
  return { ...state, activeSession: { ...state.activeSession, timer } }
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
    topUp: null,
    activeSession: null,
  }
}

// ---- progress summary (read-only, for the Progress screen) -----------------

/** True once sessions have fallen under a tenth of drills — never shown until drillCount > 0. */
export function isSessionRatioLow(state: ProgressState): boolean {
  return state.sessionCount < state.drillCount / 10
}

// ---- developer tools (stripped from production builds by the caller) -------

/**
 * Sets every daily unit in a phase to its requiredReps, so the gate becomes reachable
 * without grinding it out by hand. Never touches currentUnitId or any other counter.
 */
export function closeAllDailyUnits(
  state: ProgressState,
  curriculum: Curriculum,
  phaseId: string = state.currentPhaseId,
): ProgressState {
  const phase = findPhase(curriculum, phaseId)
  if (!phase) return state

  const unitRepCounts = { ...state.unitRepCounts }
  for (const unit of unitsOfPhase(curriculum, phase)) {
    if (unit.kind === 'daily') unitRepCounts[unit.id] = unit.requiredReps
  }
  return { ...state, unitRepCounts }
}

/** Backdates phaseEntryDate by `days`, for exercising the forced-advance boundary. */
export function setPhaseEntryDaysAgo(
  state: ProgressState,
  days: number,
  now: Date = new Date(),
): ProgressState {
  return {
    ...state,
    phaseEntryDate: new Date(now.getTime() - days * MS_PER_DAY).toISOString(),
  }
}
