import { describe, expect, it } from 'vitest'
import type { Curriculum } from '../types/curriculum.ts'
import { curriculum as realCurriculum } from '../data/curriculum.ts'
import {
  DEBT_THRESHOLD,
  SKIPS_BEFORE_ALTERNATE,
  advancePhase,
  applyForcedAdvance,
  completeSession,
  daysSince,
  getServingUnit,
  getTodayStep,
  initialProgress,
  isGateReady,
  isPhaseOverdue,
  isUnitClosed,
  markStepDone,
  markStepSkipped,
  orderStepsForUnit,
  setPhase,
  tickGate,
} from './progression.ts'
import type { ProgressState } from './progression.ts'

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
      gateStatements: ['a', 'b'],
    },
    {
      id: 'p2',
      name: 'Two',
      order: 2,
      unitIds: ['u2.1'],
      maxWeeks: 4,
      gateStatements: ['c'],
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
