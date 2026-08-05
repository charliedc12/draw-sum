import { describe, expect, it } from 'vitest'
import type { Curriculum } from '../types/curriculum.ts'
import type { LogEntry } from './progression.ts'
import { describeLogTarget, formatLogDate, groupLogByMonth } from './log.ts'

const fixture: Curriculum = {
  version: 1,
  phases: [
    {
      id: 'p1', name: 'One', order: 1, unitIds: ['u1'], maxWeeks: 5,
      gateStatements: [], errorTags: [],
    },
  ],
  units: [{ id: 'u1', phaseId: 'p1', name: 'Unit', kind: 'weekend', stepIds: ['s1'], requiredReps: 4 }],
  steps: [
    {
      id: 's1', unitId: 'u1', name: 'Draw a line', durationMin: 7, materials: 'Pen',
      instructions: ['do it'], subject: { kind: 'fromLife', text: 'thing' },
    },
  ],
  references: [],
  sessionTemplates: [],
}

function entry(overrides: Partial<LogEntry>): LogEntry {
  return {
    id: 'x',
    targetId: 's1',
    targetKind: 'step',
    date: '2026-08-12T09:00:00.000Z',
    status: 'done',
    ...overrides,
  }
}

describe('formatLogDate', () => {
  it('renders weekday, day, month with no comma', () => {
    // 12 Aug 2026 is a Wednesday.
    expect(formatLogDate('2026-08-12T09:00:00.000Z')).toBe('Wed 12 Aug')
  })
})

describe('describeLogTarget', () => {
  it('looks up a step and includes its duration', () => {
    const target = describeLogTarget(entry({ targetId: 's1', targetKind: 'step' }), fixture)
    expect(target).toEqual({ name: 'Draw a line', durationMin: 7 })
  })

  it('looks up a unit for a session and has no duration', () => {
    const target = describeLogTarget(entry({ targetId: 'u1', targetKind: 'session' }), fixture)
    expect(target).toEqual({ name: 'Unit' })
  })

  it('falls back gracefully for a dangling id', () => {
    expect(describeLogTarget(entry({ targetId: 'nope', targetKind: 'step' }), fixture).name).toBe(
      'A step',
    )
    expect(
      describeLogTarget(entry({ targetId: 'nope', targetKind: 'session' }), fixture).name,
    ).toBe('Session')
  })
})

describe('groupLogByMonth', () => {
  it('groups entries under their calendar month', () => {
    const log = [
      entry({ id: 'a', date: '2026-08-01T09:00:00.000Z' }),
      entry({ id: 'b', date: '2026-08-15T09:00:00.000Z' }),
      entry({ id: 'c', date: '2026-07-20T09:00:00.000Z' }),
    ]
    const groups = groupLogByMonth(log)
    expect(groups.map((g) => g.key)).toEqual(['2026-08', '2026-07'])
    expect(groups[0].entries).toHaveLength(2)
    expect(groups[1].entries).toHaveLength(1)
  })

  it('labels each month for display', () => {
    const groups = groupLogByMonth([entry({ date: '2026-08-01T09:00:00.000Z' })])
    expect(groups[0].label).toBe('August 2026')
  })

  it('orders months newest first', () => {
    const log = [
      entry({ id: 'a', date: '2026-01-05T09:00:00.000Z' }),
      entry({ id: 'b', date: '2026-08-05T09:00:00.000Z' }),
      entry({ id: 'c', date: '2026-03-05T09:00:00.000Z' }),
    ]
    expect(groupLogByMonth(log).map((g) => g.key)).toEqual(['2026-08', '2026-03', '2026-01'])
  })

  it('orders entries within a month newest first', () => {
    const log = [
      entry({ id: 'a', date: '2026-08-01T09:00:00.000Z' }),
      entry({ id: 'b', date: '2026-08-20T09:00:00.000Z' }),
      entry({ id: 'c', date: '2026-08-10T09:00:00.000Z' }),
    ]
    expect(groupLogByMonth(log)[0].entries.map((e) => e.id)).toEqual(['b', 'c', 'a'])
  })

  it('returns nothing for an empty log', () => {
    expect(groupLogByMonth([])).toEqual([])
  })

  it('spans a year boundary correctly', () => {
    const log = [
      entry({ id: 'a', date: '2026-01-02T09:00:00.000Z' }),
      entry({ id: 'b', date: '2025-12-30T09:00:00.000Z' }),
    ]
    const groups = groupLogByMonth(log)
    expect(groups.map((g) => g.label)).toEqual(['January 2026', 'December 2025'])
  })
})
