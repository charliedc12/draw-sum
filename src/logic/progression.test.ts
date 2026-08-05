import { describe, expect, it } from 'vitest'
import type { Curriculum } from '../types/curriculum.ts'
import { curriculum as realCurriculum } from '../data/curriculum.ts'
import {
  DEBT_THRESHOLD,
  PROPORTION_COLLAPSED_TAG,
  REGRESSION_THRESHOLD,
  REGRESSION_UNIT_ID,
  SKIPS_BEFORE_ALTERNATE,
  TOP_UP_DAYS,
  advancePhase,
  applyForcedAdvance,
  classifyPhase,
  classifyStep,
  classifyUnit,
  closeAllDailyUnits,
  completeSession,
  daysSince,
  getRegressionUnitIds,
  getServingUnit,
  getTodayStep,
  getTopUpUnitIds,
  getUntickedStatementIndices,
  initialProgress,
  isGateReady,
  isPhaseOverdue,
  isSessionRatioLow,
  isSoftRegressionActive,
  isTopUpActive,
  isUnitClosed,
  markStepDone,
  markStepSkipped,
  orderStepsForUnit,
  setPhase,
  setPhaseEntryDaysAgo,
  startTopUp,
  tickGate,
} from './progression.ts'
import type { LogEntry, ProgressState } from './progression.ts'

/* A miniature curriculum: two phases, small rep targets, one declared alternate.
   Fixtures rather than the real JSON, so a curriculum edit can't turn a rule test red. */
const fixture: Curriculum = {
  version: 1,
  phases: [
    {
      id: 'p1',
      name: 'One',
      order: 1,
      unitIds: ['u1.1', 'u1.2', 'u1.W'],
      maxWeeks: 2,
      gateStatements: [
        { text: 'a', statementUnitIds: ['u1.1'] },
        { text: 'b', statementUnitIds: ['u1.2'] },
      ],
    },
    {
      id: 'p2',
      name: 'Two',
      order: 2,
      unitIds: ['u2.1'],
      maxWeeks: 4,
      gateStatements: [{ text: 'c', statementUnitIds: ['u2.1'] }],
    },
  ],
  units: [
    { id: 'u1.1', phaseId: 'p1', name: 'A', kind: 'daily', stepIds: ['a1', 'a2'], requiredReps: 3 },
    { id: 'u1.2', phaseId: 'p1', name: 'B', kind: 'daily', stepIds: ['b1'], requiredReps: 2 },
    { id: 'u1.W', phaseId: 'p1', name: 'W', kind: 'weekend', stepIds: ['w1'], requiredReps: 2 },
    { id: 'u2.1', phaseId: 'p2', name: 'C', kind: 'daily', stepIds: ['c1'], requiredReps: 1 },
  ],
  steps: [
    {
      id: 'a1',
      unitId: 'u1.1',
      name: 'A one',
      durationMin: 6,
      materials: 'Pen',
      instructions: ['do a1'],
      subject: { kind: 'fromLife', text: 'thing' },
      alternateStepId: 'a2',
    },
    {
      id: 'a2',
      unitId: 'u1.1',
      name: 'A two',
      durationMin: 6,
      materials: 'Pen',
      instructions: ['do a2'],
      subject: { kind: 'fromLife', text: 'thing' },
    },
    {
      id: 'b1',
      unitId: 'u1.2',
      name: 'B one',
      durationMin: 7,
      materials: 'Pen',
      instructions: ['do b1'],
      subject: { kind: 'fromLife', text: 'thing' },
    },
    {
      id: 'w1',
      unitId: 'u1.W',
      name: 'Weekend',
      durationMin: 40,
      materials: 'Pen',
      instructions: ['do w1'],
      subject: { kind: 'fromLife', text: 'thing' },
    },
    {
      id: 'c1',
      unitId: 'u2.1',
      name: 'C one',
      durationMin: 8,
      materials: 'Pencil',
      instructions: ['do c1'],
      subject: { kind: 'fromLife', text: 'thing' },
    },
  ],
  references: [],
}

const T0 = new Date('2026-01-01T09:00:00.000Z')
const at = (days: number) => new Date(T0.getTime() + days * 86_400_000)

function start(overrides: Partial<ProgressState> = {}): ProgressState {
  return { ...initialProgress(fixture, T0), ...overrides }
}

function servedStepId(state: ProgressState, now: Date = T0): string | undefined {
  const view = getTodayStep(state, fixture, now)
  return view.kind === 'step' ? view.step.id : undefined
}

describe('initialProgress', () => {
  it('starts on the first phase and its first daily unit', () => {
    const state = start()
    expect(state.currentPhaseId).toBe('p1')
    expect(state.currentUnitId).toBe('u1.1')
    expect(state.drillCount).toBe(0)
    expect(state.debtCounter).toBe(0)
    expect(state.log).toEqual([])
  })
})

describe('getTodayStep — round robin', () => {
  it('serves the fewest-completed step first', () => {
    expect(servedStepId(start())).toBe('a1')
  })

  it('breaks ties by position in stepIds', () => {
    const state = start({ stepCompletionCounts: { a1: 1, a2: 1 } })
    expect(servedStepId(state)).toBe('a1')
  })

  it('cycles through the unit as steps get completed', () => {
    let state = start()
    expect(servedStepId(state)).toBe('a1')
    state = markStepDone(state, fixture, 'a1', T0)
    expect(servedStepId(state)).toBe('a2')
    state = markStepDone(state, fixture, 'a2', T0)
    expect(servedStepId(state)).toBe('a1')
  })

  it('reports the step position within its unit', () => {
    const view = getTodayStep(start(), fixture, T0)
    expect(view.kind).toBe('step')
    if (view.kind !== 'step') return
    expect(view.stepNumber).toBe(1)
    expect(view.stepCount).toBe(2)
    expect(view.unit.id).toBe('u1.1')
    expect(view.phase.id).toBe('p1')
  })

  it('orders by completions, then skips, then index', () => {
    const state = start({
      stepCompletionCounts: { a1: 0, a2: 0 },
      stepSkipCounts: { a1: 2 },
    })
    expect(orderStepsForUnit(state, fixture, fixture.units[0]).map((s) => s.id)).toEqual([
      'a2',
      'a1',
    ])
  })
})

describe('markStepDone', () => {
  it('increments completions, unit reps, drills and debt, and logs it', () => {
    const state = markStepDone(start(), fixture, 'a1', T0)
    expect(state.stepCompletionCounts.a1).toBe(1)
    expect(state.unitRepCounts['u1.1']).toBe(1)
    expect(state.drillCount).toBe(1)
    expect(state.debtCounter).toBe(1)
    expect(state.log).toHaveLength(1)
    expect(state.log[0]).toMatchObject({
      targetId: 'a1',
      targetKind: 'step',
      status: 'done',
      date: T0.toISOString(),
    })
  })

  it('ignores an unknown step id', () => {
    const before = start()
    expect(markStepDone(before, fixture, 'nope', T0)).toBe(before)
  })

  it('credits the unit that owns the step, not just the current pointer', () => {
    const state = markStepDone(start(), fixture, 'b1', T0)
    expect(state.unitRepCounts['u1.2']).toBe(1)
    expect(state.unitRepCounts['u1.1']).toBeUndefined()
  })
})

describe('unit closure', () => {
  it('closes a unit at requiredReps and moves to the next daily unit', () => {
    let state = start()
    state = markStepDone(state, fixture, 'a1', T0)
    state = markStepDone(state, fixture, 'a2', T0)
    expect(state.currentUnitId).toBe('u1.1')
    state = markStepDone(state, fixture, 'a1', T0)

    expect(isUnitClosed(state, fixture.units[0])).toBe(true)
    expect(state.currentUnitId).toBe('u1.2')
    expect(servedStepId(state)).toBe('b1')
  })

  it('skips over weekend units when advancing the pointer', () => {
    let state = start({ unitRepCounts: { 'u1.1': 3, 'u1.2': 1 } , currentUnitId: 'u1.2' })
    state = markStepDone(state, fixture, 'b1', T0)
    // u1.2 closes here; the next entry in unitIds is the weekend unit, which is not served.
    expect(state.currentUnitId).not.toBe('u1.W')
  })

  it('recovers the serving unit when the pointer is left on a closed unit', () => {
    const state = start({ unitRepCounts: { 'u1.1': 3 }, currentUnitId: 'u1.1' })
    expect(getServingUnit(state, fixture)?.id).toBe('u1.2')
    expect(servedStepId(state)).toBe('b1')
  })
})

describe('gate readiness', () => {
  it('is not ready while any daily unit is open', () => {
    const state = start({ unitRepCounts: { 'u1.1': 3 } })
    expect(isGateReady(state, fixture)).toBe(false)
  })

  it('is ready when every daily unit is closed, ignoring the weekend unit', () => {
    const state = start({ unitRepCounts: { 'u1.1': 3, 'u1.2': 2 } })
    expect(isGateReady(state, fixture)).toBe(true)
    expect(getTodayStep(state, fixture, T0).kind).toBe('gate')
  })
})

describe('debt', () => {
  it('serves a session prompt at the threshold, ahead of any step', () => {
    const state = start({ debtCounter: DEBT_THRESHOLD })
    const view = getTodayStep(state, fixture, T0)
    expect(view.kind).toBe('session')
    if (view.kind !== 'session') return
    expect(view.reason).toBe('debt')
    expect(view.drillsOwed).toBe(DEBT_THRESHOLD)
    expect(view.unit?.id).toBe('u1.W')
    expect(view.steps.map((s) => s.id)).toEqual(['w1'])
  })

  it('still serves a step one drill below the threshold', () => {
    const state = start({ debtCounter: DEBT_THRESHOLD - 1 })
    expect(getTodayStep(state, fixture, T0).kind).toBe('step')
  })

  it('outranks a ready gate', () => {
    const state = start({
      debtCounter: DEBT_THRESHOLD,
      unitRepCounts: { 'u1.1': 3, 'u1.2': 2 },
    })
    expect(getTodayStep(state, fixture, T0).kind).toBe('session')
  })

  it('accumulates one unit of debt per completed drill', () => {
    let state = start()
    for (let i = 0; i < DEBT_THRESHOLD; i++) {
      state = markStepDone(state, fixture, 'a1', T0)
    }
    expect(state.debtCounter).toBe(DEBT_THRESHOLD)
  })
})

describe('markStepSkipped', () => {
  it('does not touch reps, drills or debt', () => {
    const state = markStepSkipped(start(), fixture, 'a1', T0)
    expect(state.unitRepCounts['u1.1']).toBeUndefined()
    expect(state.drillCount).toBe(0)
    expect(state.debtCounter).toBe(0)
    expect(state.stepCompletionCounts.a1).toBeUndefined()
  })

  it('increments the skip count and logs it', () => {
    const state = markStepSkipped(start(), fixture, 'a1', T0)
    expect(state.stepSkipCounts.a1).toBe(1)
    expect(state.log[0]).toMatchObject({ targetId: 'a1', status: 'skipped' })
  })

  it('serves the next step in the unit', () => {
    const state = markStepSkipped(start(), fixture, 'a1', T0)
    expect(servedStepId(state)).toBe('a2')
  })

  it('offers the alternate after the third skip of the same step', () => {
    let state = start()
    for (let i = 0; i < SKIPS_BEFORE_ALTERNATE; i++) {
      state = markStepSkipped(state, fixture, 'a1', T0)
      state = markStepSkipped(state, fixture, 'a2', T0)
    }
    const view = getTodayStep(state, fixture, T0)
    expect(view.kind).toBe('step')
    if (view.kind !== 'step') return
    expect(view.step.id).toBe('a1')
    expect(view.alternate?.id).toBe('a2')
  })

  it('does not offer an alternate before the third skip', () => {
    let state = start()
    state = markStepSkipped(state, fixture, 'a1', T0)
    state = markStepSkipped(state, fixture, 'a2', T0)
    const view = getTodayStep(state, fixture, T0)
    if (view.kind !== 'step') throw new Error('expected a step')
    expect(view.alternate).toBeUndefined()
  })
})

describe('completeSession', () => {
  it('clears the debt, counts the session and logs it', () => {
    const state = completeSession(start({ debtCounter: 12 }), fixture, T0)
    expect(state.debtCounter).toBe(0)
    expect(state.sessionCount).toBe(1)
    expect(state.log[0]).toMatchObject({ targetKind: 'session', status: 'done' })
  })

  it('credits the phase weekend unit', () => {
    const state = completeSession(start(), fixture, T0)
    expect(state.unitRepCounts['u1.W']).toBe(1)
  })

  it('returns to serving steps once the debt is cleared', () => {
    const state = completeSession(start({ debtCounter: DEBT_THRESHOLD }), fixture, T0)
    expect(getTodayStep(state, fixture, T0).kind).toBe('step')
  })
})

describe('gate ticks', () => {
  it('records a tick per statement index', () => {
    const state = tickGate(start(), fixture, 'p1', 1, true)
    expect(state.gateTicks.p1).toEqual([false, true])
  })

  it('ignores an out-of-range index or unknown phase', () => {
    const before = start()
    expect(tickGate(before, fixture, 'p1', 9, true)).toBe(before)
    expect(tickGate(before, fixture, 'nope', 0, true)).toBe(before)
  })
})

describe('phase movement', () => {
  it('advances to the next phase and resets the entry date', () => {
    const state = advancePhase(start(), fixture, at(3))
    expect(state.currentPhaseId).toBe('p2')
    expect(state.currentUnitId).toBe('u2.1')
    expect(state.phaseEntryDate).toBe(at(3).toISOString())
    expect(state.forcedAdvance).toBe(false)
  })

  it('stays put on the last phase', () => {
    const state = advancePhase(start({ currentPhaseId: 'p2' }), fixture, at(3))
    expect(state.currentPhaseId).toBe('p2')
  })

  it('setPhase moves backwards without erasing progress', () => {
    const earned = markStepDone(start(), fixture, 'a1', T0)
    const moved = setPhase(earned, fixture, 'p2', at(1))
    const back = setPhase(moved, fixture, 'p1', at(2))
    expect(back.currentPhaseId).toBe('p1')
    expect(back.stepCompletionCounts.a1).toBe(1)
    expect(back.unitRepCounts['u1.1']).toBe(1)
    expect(back.drillCount).toBe(1)
  })
})

describe('forced advance', () => {
  it('is not overdue before maxWeeks', () => {
    expect(isPhaseOverdue(start(), fixture, at(13))).toBe(false)
  })

  it('is overdue at maxWeeks * 7 days', () => {
    expect(isPhaseOverdue(start(), fixture, at(14))).toBe(true)
  })

  it('advances regardless of gate ticks and flags why', () => {
    const state = applyForcedAdvance(start(), fixture, at(14))
    expect(state.currentPhaseId).toBe('p2')
    expect(state.forcedAdvance).toBe(true)
  })

  it('leaves state alone while the phase is still in time', () => {
    const before = start()
    expect(applyForcedAdvance(before, fixture, at(13))).toBe(before)
  })

  it('keeps every earned count through the forced advance', () => {
    const earned = markStepDone(start(), fixture, 'a1', T0)
    const state = applyForcedAdvance(earned, fixture, at(20))
    expect(state.stepCompletionCounts.a1).toBe(1)
    expect(state.unitRepCounts['u1.1']).toBe(1)
    expect(state.drillCount).toBe(1)
  })
})

describe('gaps in usage never cost progress', () => {
  it('serves the same next step after a six-month absence', () => {
    const state = markStepDone(start(), fixture, 'a1', T0)
    expect(servedStepId(state, at(180))).toBe(servedStepId(state, T0))
  })

  it('keeps unit reps, drill count and debt across a long gap', () => {
    const state = markStepDone(markStepDone(start(), fixture, 'a1', T0), fixture, 'a2', T0)
    const later = markStepDone(state, fixture, 'a1', at(200))
    expect(later.unitRepCounts['u1.1']).toBe(3)
    expect(later.drillCount).toBe(3)
    expect(later.debtCounter).toBe(3)
  })

  it('daysSince never goes negative and survives a bad date', () => {
    expect(daysSince(at(5).toISOString(), T0)).toBe(0)
    expect(daysSince('not-a-date', T0)).toBe(0)
  })
})

describe('classifyPhase', () => {
  it('marks phases before the active one completed, the active one current, and later ones upcoming', () => {
    const state = start({ currentPhaseId: 'p2' })
    expect(classifyPhase(state, fixture, fixture.phases[0])).toBe('completed')
    expect(classifyPhase(state, fixture, fixture.phases[1])).toBe('current')
  })

  it('future phases classify as upcoming, never anything that implies a lock', () => {
    const state = start()
    expect(classifyPhase(state, fixture, fixture.phases[1])).toBe('upcoming')
  })
})

describe('classifyUnit', () => {
  it('is completed once requiredReps is met, regardless of phase', () => {
    const state = start({ unitRepCounts: { 'u1.1': 3 } })
    expect(classifyUnit(state, fixture, fixture.units[0])).toBe('completed')
  })

  it('is current for the unit getServingUnit would serve next', () => {
    const state = start()
    expect(classifyUnit(state, fixture, fixture.units[0])).toBe('current')
    expect(classifyUnit(state, fixture, fixture.units[1])).toBe('upcoming')
  })

  it('is upcoming for a unit in a phase that has not been reached', () => {
    const state = start()
    const otherPhaseUnit = fixture.units.find((u) => u.phaseId === 'p2')!
    expect(classifyUnit(state, fixture, otherPhaseUnit)).toBe('upcoming')
  })

  it('treats an open weekend unit as current the moment its phase is active', () => {
    const state = start()
    const weekend = fixture.units.find((u) => u.kind === 'weekend')!
    expect(classifyUnit(state, fixture, weekend)).toBe('current')
  })

  it('closed weekend unit still reads completed', () => {
    const weekend = fixture.units.find((u) => u.kind === 'weekend')!
    const state = start({ unitRepCounts: { [weekend.id]: weekend.requiredReps } })
    expect(classifyUnit(state, fixture, weekend)).toBe('completed')
  })
})

describe('classifyStep', () => {
  it('is completed once it has any completions, even mid-cycle', () => {
    const state = start({ stepCompletionCounts: { a1: 1 } })
    expect(classifyStep(state, fixture, fixture.steps[0])).toBe('completed')
  })

  it('is current for exactly the step getTodayStep would serve', () => {
    const state = start()
    expect(classifyStep(state, fixture, fixture.steps[0])).toBe('current')
    expect(classifyStep(state, fixture, fixture.steps[1])).toBe('upcoming')
  })

  it('is upcoming for a step in a unit not yet being served', () => {
    const state = start()
    const b1 = fixture.steps.find((s) => s.id === 'b1')!
    expect(classifyStep(state, fixture, b1)).toBe('upcoming')
  })

  it('reclassifies as steps complete and the pointer moves', () => {
    let state = start()
    state = markStepDone(state, fixture, 'a1', T0)
    expect(classifyStep(state, fixture, fixture.steps[0])).toBe('completed')
    expect(classifyStep(state, fixture, fixture.steps[1])).toBe('current')
  })
})

describe('gate evaluation', () => {
  it('none ticked: every statement is unticked, nothing to advance on', () => {
    const state = start()
    expect(getUntickedStatementIndices(state, fixture, 'p1')).toEqual([0, 1])
  })

  it('some ticked: only the unticked indices are reported', () => {
    const state = tickGate(start(), fixture, 'p1', 0, true)
    expect(getUntickedStatementIndices(state, fixture, 'p1')).toEqual([1])
  })

  it('all ticked: nothing left unticked', () => {
    let state = tickGate(start(), fixture, 'p1', 0, true)
    state = tickGate(state, fixture, 'p1', 1, true)
    expect(getUntickedStatementIndices(state, fixture, 'p1')).toEqual([])
  })

  it('unticking after ticking is reflected immediately', () => {
    let state = tickGate(start(), fixture, 'p1', 0, true)
    state = tickGate(state, fixture, 'p1', 0, false)
    expect(getUntickedStatementIndices(state, fixture, 'p1')).toEqual([0, 1])
  })
})

describe('gate top-up', () => {
  it('assembles the units behind exactly the unticked statements', () => {
    const state = tickGate(start(), fixture, 'p1', 0, true) // 'a' ticked, 'b' (-> u1.2) is not
    const withTopUp = startTopUp(state, fixture, T0)
    expect(withTopUp.topUp).toMatchObject({ phaseId: 'p1', statementIndices: [1] })
    expect(getTopUpUnitIds(withTopUp, fixture, T0)).toEqual(['u1.2'])
  })

  it('is a no-op when everything is already ticked — nothing to top up', () => {
    let state = tickGate(start(), fixture, 'p1', 0, true)
    state = tickGate(state, fixture, 'p1', 1, true)
    const after = startTopUp(state, fixture, T0)
    expect(after.topUp).toBeNull()
  })

  it('is active immediately and inactive once TOP_UP_DAYS have passed', () => {
    const state = startTopUp(tickGate(start(), fixture, 'p1', 0, true), fixture, T0)
    expect(isTopUpActive(state, fixture, T0)).toBe(true)
    expect(isTopUpActive(state, fixture, at(TOP_UP_DAYS - 1))).toBe(true)
    expect(isTopUpActive(state, fixture, at(TOP_UP_DAYS))).toBe(false)
  })

  it('stops applying once the user has moved to a different phase', () => {
    const state = startTopUp(tickGate(start(), fixture, 'p1', 0, true), fixture, T0)
    const moved = setPhase(state, fixture, 'p2', T0)
    expect(isTopUpActive(moved, fixture, T0)).toBe(false)
    expect(getTopUpUnitIds(moved, fixture, T0)).toEqual([])
  })

  it('serves the top-up unit instead of the gate once every daily unit is closed', () => {
    let state = start({ unitRepCounts: { 'u1.1': 3, 'u1.2': 2 } }) // gate-ready
    state = tickGate(state, fixture, 'p1', 0, true) // leaves 'b' (u1.2) unticked
    state = startTopUp(state, fixture, T0)

    const view = getTodayStep(state, fixture, T0)
    expect(view.kind).toBe('step')
    if (view.kind !== 'step') return
    expect(view.unit.id).toBe('u1.2')
  })

  it('falls back to the gate once the top-up window closes', () => {
    let state = start({ unitRepCounts: { 'u1.1': 3, 'u1.2': 2 } })
    state = tickGate(state, fixture, 'p1', 0, true)
    state = startTopUp(state, fixture, T0)

    expect(getTodayStep(state, fixture, at(TOP_UP_DAYS)).kind).toBe('gate')
  })
})

describe('forced advance boundary', () => {
  it('is not overdue one day before maxWeeks * 7', () => {
    expect(isPhaseOverdue(start(), fixture, at(2 * 7 - 1))).toBe(false)
  })

  it('is overdue exactly at maxWeeks * 7', () => {
    expect(isPhaseOverdue(start(), fixture, at(2 * 7))).toBe(true)
  })

  it('does not advance the day before the boundary', () => {
    const state = applyForcedAdvance(start(), fixture, at(2 * 7 - 1))
    expect(state.currentPhaseId).toBe('p1')
  })

  it('advances exactly on the boundary day', () => {
    const state = applyForcedAdvance(start(), fixture, at(2 * 7))
    expect(state.currentPhaseId).toBe('p2')
    expect(state.forcedAdvance).toBe(true)
  })
})

describe('soft regression detection', () => {
  const session = (overrides: Partial<LogEntry>): LogEntry => ({
    id: Math.random().toString(36),
    targetId: 'u2.W',
    targetKind: 'session',
    date: T0.toISOString(),
    status: 'done',
    ...overrides,
  })

  it('does not trigger below Phase 4', () => {
    const log = Array.from({ length: 3 }, () => session({ tags: [PROPORTION_COLLAPSED_TAG] }))
    const state = start({ currentPhaseId: 'p2', log })
    expect(isSoftRegressionActive(state, realCurriculum)).toBe(false)
  })

  it('triggers at 3 of the last 5 tagged sessions from Phase 4 onward', () => {
    const log = [
      session({ id: 'a', tags: [PROPORTION_COLLAPSED_TAG] }),
      session({ id: 'b', tags: [] }),
      session({ id: 'c', tags: [PROPORTION_COLLAPSED_TAG] }),
      session({ id: 'd', tags: [] }),
      session({ id: 'e', tags: [PROPORTION_COLLAPSED_TAG] }),
    ]
    const state = { ...initialProgress(realCurriculum, T0), currentPhaseId: 'p4', log }
    expect(isSoftRegressionActive(state, realCurriculum)).toBe(true)
  })

  it('does not trigger at 2 of the last 5', () => {
    const log = [
      session({ id: 'a', tags: [PROPORTION_COLLAPSED_TAG] }),
      session({ id: 'b', tags: [] }),
      session({ id: 'c', tags: [PROPORTION_COLLAPSED_TAG] }),
      session({ id: 'd', tags: [] }),
      session({ id: 'e', tags: [] }),
    ]
    const state = { ...initialProgress(realCurriculum, T0), currentPhaseId: 'p4', log }
    expect(isSoftRegressionActive(state, realCurriculum)).toBe(false)
  })

  it('only looks at the most recent 5 — an old tagged session outside the window does not count', () => {
    const log = [
      // Older, tagged sessions — outside the 5-session window once the recent ones exist.
      session({ id: 'old1', date: at(1).toISOString(), tags: [PROPORTION_COLLAPSED_TAG] }),
      session({ id: 'old2', date: at(2).toISOString(), tags: [PROPORTION_COLLAPSED_TAG] }),
      session({ id: 'old3', date: at(3).toISOString(), tags: [PROPORTION_COLLAPSED_TAG] }),
      // The five most recent — none tagged.
      session({ id: 'recent1', date: at(30).toISOString(), tags: [] }),
      session({ id: 'recent2', date: at(31).toISOString(), tags: [] }),
      session({ id: 'recent3', date: at(32).toISOString(), tags: [] }),
      session({ id: 'recent4', date: at(33).toISOString(), tags: [] }),
      session({ id: 'recent5', date: at(34).toISOString(), tags: [] }),
    ]
    const state = { ...initialProgress(realCurriculum, T0), currentPhaseId: 'p4', log }
    expect(isSoftRegressionActive(state, realCurriculum)).toBe(false)
  })

  it('never changes currentPhaseId or resets any counter — it only adds a unit to the pool', () => {
    const log = Array.from({ length: REGRESSION_THRESHOLD }, () =>
      session({ id: Math.random().toString(36), tags: [PROPORTION_COLLAPSED_TAG] }),
    )
    const state = {
      ...initialProgress(realCurriculum, T0),
      currentPhaseId: 'p4',
      drillCount: 42,
      log,
    }
    expect(getRegressionUnitIds(state, realCurriculum)).toEqual([REGRESSION_UNIT_ID])
    expect(state.currentPhaseId).toBe('p4')
    expect(state.drillCount).toBe(42)
  })

  it('interleaves the regression unit alongside the current phase unit, never replacing it', () => {
    const log = Array.from({ length: REGRESSION_THRESHOLD }, () =>
      session({ id: Math.random().toString(36), tags: [PROPORTION_COLLAPSED_TAG] }),
    )
    const state = { ...initialProgress(realCurriculum, T0), currentPhaseId: 'p4', log }
    const view = getTodayStep(state, realCurriculum, T0)
    expect(view.kind).toBe('step')
    if (view.kind !== 'step') return
    // Phase 4 has done zero drills and Phase 2's Measuring also has zero — the p4 step
    // wins the tie via the "primary unit first" ordering, and gets no supporting note.
    expect(view.phase.id).toBe('p4')
    expect(view.supportingNote).toBeUndefined()
  })

  it('marks a served regression step with a supporting-drill note naming the earlier phase', () => {
    const log = Array.from({ length: REGRESSION_THRESHOLD }, () =>
      session({ id: Math.random().toString(36), tags: [PROPORTION_COLLAPSED_TAG] }),
    )
    // Give Phase 4's own next-up steps a head start in completions, so the regression
    // unit's untouched steps win the "fewest completions" ordering.
    const phase4FirstUnit = realCurriculum.units.find((u) => u.id === 'u4.1')!
    const stepCompletionCounts = Object.fromEntries(
      phase4FirstUnit.stepIds.map((id) => [id, 10]),
    )
    const state = {
      ...initialProgress(realCurriculum, T0),
      currentPhaseId: 'p4',
      stepCompletionCounts,
      log,
    }
    const view = getTodayStep(state, realCurriculum, T0)
    expect(view.kind).toBe('step')
    if (view.kind !== 'step') return
    expect(view.unit.id).toBe(REGRESSION_UNIT_ID)
    expect(view.phase.id).toBe('p2')
    expect(view.supportingNote).toBe('Supporting drill from Phase 2 — Observation.')
  })
})

describe('isSessionRatioLow', () => {
  it('is false with no drills yet', () => {
    expect(isSessionRatioLow(start({ drillCount: 0, sessionCount: 0 }))).toBe(false)
  })

  it('is false once sessions keep pace with a tenth of drills', () => {
    expect(isSessionRatioLow(start({ drillCount: 50, sessionCount: 5 }))).toBe(false)
  })

  it('is true once sessions fall under a tenth of drills', () => {
    expect(isSessionRatioLow(start({ drillCount: 50, sessionCount: 4 }))).toBe(true)
  })
})

describe('dev tools', () => {
  it('closeAllDailyUnits closes every daily unit in the phase and nothing else', () => {
    const state = closeAllDailyUnits(start(), fixture, 'p1')
    expect(state.unitRepCounts['u1.1']).toBe(3)
    expect(state.unitRepCounts['u1.2']).toBe(2)
    expect(state.unitRepCounts['u1.W']).toBeUndefined()
    expect(isGateReady(state, fixture)).toBe(true)
  })

  it('closeAllDailyUnits does not touch currentUnitId or drillCount', () => {
    const before = start({ drillCount: 7 })
    const state = closeAllDailyUnits(before, fixture, 'p1')
    expect(state.currentUnitId).toBe(before.currentUnitId)
    expect(state.drillCount).toBe(7)
  })

  it('setPhaseEntryDaysAgo backdates phaseEntryDate by exactly N days', () => {
    const state = setPhaseEntryDaysAgo(start(), 10, T0)
    expect(state.phaseEntryDate).toBe(at(-10).toISOString())
  })
})

describe('the real curriculum', () => {
  it('serves the first drill of Phase 1 from a cold start', () => {
    const state = initialProgress(realCurriculum, T0)
    const view = getTodayStep(state, realCurriculum, T0)
    expect(view.kind).toBe('step')
    if (view.kind !== 'step') return
    expect(view.phase.id).toBe('p1')
    expect(view.unit.id).toBe('u1.1')
    expect(view.step.id).toBe('s1.1.1')
    expect(view.step.durationMin).toBe(6)
    expect(view.step.commonFailure).toContain('Hooking the line')
  })

  it('reaches the Phase 1 gate by closing all three daily units', () => {
    let state = initialProgress(realCurriculum, T0)
    for (let i = 0; i < 40; i++) {
      const view = getTodayStep(state, realCurriculum, T0)
      if (view.kind === 'gate') break
      if (view.kind === 'session') {
        state = completeSession(state, realCurriculum, T0)
        continue
      }
      if (view.kind !== 'step') throw new Error('unexpected empty view')
      state = markStepDone(state, realCurriculum, view.step.id, T0)
    }
    expect(getTodayStep(state, realCurriculum, T0).kind).toBe('gate')
    expect(state.unitRepCounts['u1.1']).toBe(8)
    expect(state.unitRepCounts['u1.2']).toBe(6)
    expect(state.unitRepCounts['u1.3']).toBe(6)
  })
})
