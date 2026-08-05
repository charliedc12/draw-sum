import { describe, expect, it } from 'vitest'
import type { Curriculum } from '../types/curriculum.ts'
import type { IdMigration } from './migrations.ts'
import { migrateProgressState } from './migrations.ts'
import { initialProgress } from './progression.ts'
import type { LogEntry, ProgressState } from './progression.ts'

/* A minimal v1 curriculum — and a v2 revision that renames a unit and two steps, the
   way a real curriculum edit might (say, splitting "Marks" into two clearer unit
   names, or fixing a typo'd ID). Fixtures rather than the real JSON, so a real future
   curriculum edit can't accidentally invalidate this test. */
const v1Curriculum: Curriculum = {
  version: 1,
  phases: [
    { id: 'p1', name: 'One', order: 1, unitIds: ['u1.1', 'u1.W'], maxWeeks: 5, gateStatements: [], errorTags: [] },
  ],
  units: [
    { id: 'u1.1', phaseId: 'p1', name: 'Marks', kind: 'daily', stepIds: ['s1.1.1', 's1.1.2'], requiredReps: 4 },
    { id: 'u1.W', phaseId: 'p1', name: 'Weekend', kind: 'weekend', stepIds: ['w1'], requiredReps: 2 },
  ],
  steps: [
    { id: 's1.1.1', unitId: 'u1.1', name: 'A', durationMin: 6, materials: 'Pen', instructions: ['x'], subject: { kind: 'fromLife', text: 'x' } },
    { id: 's1.1.2', unitId: 'u1.1', name: 'B', durationMin: 6, materials: 'Pen', instructions: ['x'], subject: { kind: 'fromLife', text: 'x' } },
    { id: 'w1', unitId: 'u1.W', name: 'W', durationMin: 40, materials: 'Pen', instructions: ['x'], subject: { kind: 'fromLife', text: 'x' } },
  ],
  references: [],
  sessionTemplates: [],
  microDrills: [],
  redrawSubjects: [],
}

// The v2 revision: u1.1 renamed to u1.marks, and its two steps renamed to match.
const v2Curriculum: Curriculum = {
  ...v1Curriculum,
  version: 2,
  phases: [{ ...v1Curriculum.phases[0], unitIds: ['u1.marks', 'u1.W'] }],
  units: [
    { id: 'u1.marks', phaseId: 'p1', name: 'Marks', kind: 'daily', stepIds: ['s1.marks.1', 's1.marks.2'], requiredReps: 4 },
    v1Curriculum.units[1],
  ],
  steps: [
    { ...v1Curriculum.steps[0], id: 's1.marks.1', unitId: 'u1.marks' },
    { ...v1Curriculum.steps[1], id: 's1.marks.2', unitId: 'u1.marks' },
    v1Curriculum.steps[2],
  ],
}

const migration: IdMigration = {
  fromVersion: 1,
  toVersion: 2,
  unitIdMap: { 'u1.1': 'u1.marks' },
  stepIdMap: { 's1.1.1': 's1.marks.1', 's1.1.2': 's1.marks.2' },
}

/** A v1 save with real history attached to every ID-bearing field. */
function v1StateWithHistory(): ProgressState & { curriculumVersion?: number } {
  const base = initialProgress(v1Curriculum, new Date('2026-01-01T09:00:00.000Z'))
  const log: LogEntry[] = [
    { id: 'l1', targetId: 's1.1.1', targetKind: 'step', date: '2026-01-02T09:00:00.000Z', status: 'done' },
    { id: 'l2', targetId: 's1.1.2', targetKind: 'step', date: '2026-01-03T09:00:00.000Z', status: 'skipped' },
    { id: 'l3', targetId: 'u1.W', targetKind: 'session', date: '2026-01-04T09:00:00.000Z', status: 'done', tags: ['x'] },
  ]
  return {
    ...base,
    currentUnitId: 'u1.1',
    unitRepCounts: { 'u1.1': 3, 'u1.W': 1 },
    stepCompletionCounts: { 's1.1.1': 2, 's1.1.2': 1 },
    stepSkipCounts: { 's1.1.1': 1 },
    drillCount: 3,
    sessionCount: 1,
    log,
    gateTicks: { p1: [true, false] },
    topUp: { phaseId: 'p1', statementIndices: [0], startedAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-01-15T00:00:00.000Z' },
    activeSession: null,
    curriculumVersion: 1,
  }
}

describe('migrateProgressState — v1 state against a v2 curriculum', () => {
  it('remaps every ID-bearing field to the new IDs', () => {
    const migrated = migrateProgressState(v1StateWithHistory(), v2Curriculum, [migration])

    expect(migrated.currentUnitId).toBe('u1.marks')
    expect(migrated.unitRepCounts).toEqual({ 'u1.marks': 3, 'u1.W': 1 })
    expect(migrated.stepCompletionCounts).toEqual({ 's1.marks.1': 2, 's1.marks.2': 1 })
    expect(migrated.stepSkipCounts).toEqual({ 's1.marks.1': 1 })
    expect(migrated.topUp?.phaseId).toBe('p1') // no phase rename in this migration
  })

  it('loses no log history — same entries, same order, same status and tags, new targetId', () => {
    const before = v1StateWithHistory()
    const migrated = migrateProgressState(before, v2Curriculum, [migration])

    expect(migrated.log).toHaveLength(before.log.length)
    expect(migrated.log.map((e) => e.targetId)).toEqual(['s1.marks.1', 's1.marks.2', 'u1.W'])
    expect(migrated.log.map((e) => e.status)).toEqual(before.log.map((e) => e.status))
    expect(migrated.log.map((e) => e.date)).toEqual(before.log.map((e) => e.date))
    expect(migrated.log[2].tags).toEqual(['x'])
  })

  it('loses no counters that are not ID-keyed', () => {
    const before = v1StateWithHistory()
    const migrated = migrateProgressState(before, v2Curriculum, [migration])

    expect(migrated.drillCount).toBe(before.drillCount)
    expect(migrated.sessionCount).toBe(before.sessionCount)
    expect(migrated.gateTicks).toEqual(before.gateTicks)
  })

  it('stamps the state with the curriculum current version', () => {
    const migrated = migrateProgressState(v1StateWithHistory(), v2Curriculum, [migration])
    expect(migrated.curriculumVersion).toBe(2)
  })

  it('every migrated unit/step ID actually resolves in the v2 curriculum', () => {
    const migrated = migrateProgressState(v1StateWithHistory(), v2Curriculum, [migration])
    const unitIds = new Set(v2Curriculum.units.map((u) => u.id))
    const stepIds = new Set(v2Curriculum.steps.map((s) => s.id))

    expect(unitIds.has(migrated.currentUnitId)).toBe(true)
    for (const key of Object.keys(migrated.unitRepCounts)) expect(unitIds.has(key)).toBe(true)
    for (const key of Object.keys(migrated.stepCompletionCounts)) expect(stepIds.has(key)).toBe(true)
    for (const entry of migrated.log) {
      if (entry.targetKind === 'step') expect(stepIds.has(entry.targetId)).toBe(true)
    }
  })

  it('is a no-op once already at the current version — idempotent, does not double-remap', () => {
    const already = { ...v1StateWithHistory(), curriculumVersion: 2 }
    const migrated = migrateProgressState(already, v2Curriculum, [migration])
    // Nothing to migrate from v2 forward, so the (already old-ID) fields pass through
    // untouched — proving a second run never re-applies a migration it already used.
    expect(migrated.currentUnitId).toBe('u1.1')
    expect(migrated.curriculumVersion).toBe(2)
  })

  it('treats a state with no recorded version as version 1 — the field did not always exist', () => {
    const legacy = v1StateWithHistory()
    // @ts-expect-error simulating a save from before curriculumVersion existed
    delete legacy.curriculumVersion
    const migrated = migrateProgressState(legacy, v2Curriculum, [migration])
    expect(migrated.currentUnitId).toBe('u1.marks')
    expect(migrated.curriculumVersion).toBe(2)
  })

  it('is a genuine no-op when there are no applicable migrations at all', () => {
    const state = v1StateWithHistory()
    const migrated = migrateProgressState(state, v1Curriculum, [])
    expect(migrated.currentUnitId).toBe(state.currentUnitId)
    expect(migrated.unitRepCounts).toEqual(state.unitRepCounts)
    expect(migrated.curriculumVersion).toBe(1)
  })

  it('microDrill log entries are left alone — they live in their own ID namespace', () => {
    const state = v1StateWithHistory()
    state.log.push({
      id: 'l4',
      targetId: 'micro-lines',
      targetKind: 'microDrill',
      date: '2026-01-05T09:00:00.000Z',
      status: 'done',
    })
    const migrated = migrateProgressState(state, v2Curriculum, [migration])
    expect(migrated.log.find((e) => e.targetKind === 'microDrill')?.targetId).toBe('micro-lines')
  })
})

describe('migrateProgressState against the real curriculum', () => {
  it('is a no-op today — nothing has ever been renamed', async () => {
    const { curriculum } = await import('../data/curriculum.ts')
    const state = initialProgress(curriculum)
    const migrated = migrateProgressState(state, curriculum)
    expect(migrated).toEqual({ ...state, curriculumVersion: curriculum.version })
  })
})
