import { describe, expect, it } from 'vitest'
import type { Curriculum } from '../types/curriculum.ts'
import type { TodayView } from './progression.ts'
import {
  buildDailyNotificationCopy,
  buildWeeklyNotificationCopy,
  defaultNotificationSettings,
  getDueNotifications,
  isSlotDue,
  isStandalone,
  isWeeklySlotDue,
} from './notifications.ts'
import type { NotificationSlot, NotificationSettings, WeeklyNotificationSlot } from './notifications.ts'

// Constructed with separate args (not an ISO string) so this is 09:00 in the test
// runner's own local time — matching how isSlotDue reads hour/minute, and how a
// user's "9am reminder" should behave regardless of what timezone they're in.
const T0 = new Date(2026, 7, 5, 9, 0, 0, 0) // Wed 5 Aug 2026, 09:00 local

function slot(overrides: Partial<NotificationSlot> = {}): NotificationSlot {
  return { hour: 9, minute: 0, enabled: true, lastFiredAt: null, ...overrides }
}

describe('defaultNotificationSettings', () => {
  it('starts with everything disabled and never fired', () => {
    const settings = defaultNotificationSettings()
    expect(settings.daily).toHaveLength(2)
    expect(settings.daily.every((s) => !s.enabled)).toBe(true)
    expect(settings.weekly.enabled).toBe(false)
    expect(settings.daily.every((s) => s.lastFiredAt === null)).toBe(true)
  })
})

describe('isSlotDue', () => {
  it('is false while disabled, no matter the time', () => {
    expect(isSlotDue(slot({ enabled: false, hour: 0, minute: 0 }), T0)).toBe(false)
  })

  it('is false before the scheduled time today', () => {
    expect(isSlotDue(slot({ hour: 10, minute: 0 }), T0)).toBe(false) // T0 is 09:00
  })

  it('is true once the scheduled time has passed and it has never fired', () => {
    expect(isSlotDue(slot({ hour: 8, minute: 0 }), T0)).toBe(true)
  })

  it('is true exactly at the scheduled minute', () => {
    expect(isSlotDue(slot({ hour: 9, minute: 0 }), T0)).toBe(true)
  })

  it('is false again once it has already fired today', () => {
    const firedToday = new Date(T0)
    firedToday.setHours(9, 0, 0, 0)
    expect(isSlotDue(slot({ hour: 8, minute: 0, lastFiredAt: firedToday.toISOString() }), T0)).toBe(
      false,
    )
  })

  it('re-arms the next day automatically, no manual reset needed', () => {
    const firedYesterday = new Date(T0.getTime() - 24 * 60 * 60 * 1000)
    const due = isSlotDue(slot({ hour: 8, minute: 0, lastFiredAt: firedYesterday.toISOString() }), T0)
    expect(due).toBe(true)
  })
})

describe('isWeeklySlotDue', () => {
  it('is false on any day other than the configured weekday', () => {
    const wrongDay = slot({ hour: 8, minute: 0 }) as WeeklyNotificationSlot
    wrongDay.weekday = (T0.getDay() + 1) % 7
    wrongDay.durationOption = 45
    expect(isWeeklySlotDue(wrongDay, T0)).toBe(false)
  })

  it('is true on the configured weekday once the time has passed', () => {
    const today = slot({ hour: 8, minute: 0 }) as WeeklyNotificationSlot
    today.weekday = T0.getDay()
    today.durationOption = 45
    expect(isWeeklySlotDue(today, T0)).toBe(true)
  })

  it('re-arms a week later — last week’s fire does not suppress this week', () => {
    const weekAgo = new Date(T0.getTime() - 7 * 24 * 60 * 60 * 1000)
    const weekly = slot({ hour: 8, minute: 0, lastFiredAt: weekAgo.toISOString() }) as WeeklyNotificationSlot
    weekly.weekday = T0.getDay()
    weekly.durationOption = 45
    expect(isWeeklySlotDue(weekly, T0)).toBe(true)
  })
})

describe('getDueNotifications', () => {
  it('returns both daily slots and the weekly slot when all are due', () => {
    const settings: NotificationSettings = {
      daily: [slot({ hour: 8 }), slot({ hour: 8, minute: 30 })],
      weekly: { ...slot({ hour: 8 }), weekday: T0.getDay(), durationOption: 45 },
    }
    expect(getDueNotifications(settings, T0)).toEqual([
      { kind: 'daily', index: 0 },
      { kind: 'daily', index: 1 },
      { kind: 'weekly' },
    ])
  })

  it('returns an empty list when nothing is due', () => {
    const settings = defaultNotificationSettings()
    expect(getDueNotifications(settings, T0)).toEqual([])
  })

  it('respects "max two per day" structurally — daily is always exactly a pair', () => {
    const settings = defaultNotificationSettings()
    expect(settings.daily).toHaveLength(2)
  })
})

describe('buildDailyNotificationCopy', () => {
  const curriculum: Curriculum = {
    version: 1,
    phases: [{ id: 'p3', name: 'Perspective and construction', order: 3, unitIds: [], maxWeeks: 10, gateStatements: [], errorTags: [] }],
    units: [{ id: 'u3.2', phaseId: 'p3', name: 'Cylinders', kind: 'daily', stepIds: [], requiredReps: 1 }],
    steps: [],
    references: [],
    sessionTemplates: [],
    microDrills: [],
    redrawSubjects: [],
  }

  it('matches the exact given format for a step', () => {
    const view: TodayView = {
      kind: 'step',
      phase: curriculum.phases[0],
      unit: curriculum.units[0],
      step: {
        id: 's3.2.2', unitId: 'u3.2', name: 'x', durationMin: 8, materials: 'Pencil',
        instructions: ['x'], subject: { kind: 'fromLife', text: 'x' },
      },
      stepNumber: 2,
      stepCount: 3,
      phaseOverdue: false,
    }
    const copy = buildDailyNotificationCopy(view)
    expect(copy?.body).toBe('Phase 3 · Unit 3.2 · Step 2 — 8 minutes')
  })

  it('never mentions time away, streaks, or anything phrased as a warning', () => {
    const view: TodayView = { kind: 'gate', phase: curriculum.phases[0], phaseOverdue: false }
    const copy = buildDailyNotificationCopy(view)
    const text = `${copy?.title} ${copy?.body}`
    for (const word of [/streak/i, /haven'?t/i, /missed/i, /overdue/i, /days? since/i]) {
      expect(text).not.toMatch(word)
    }
  })

  it('is null when there is nothing to say', () => {
    const view: TodayView = { kind: 'empty', phaseOverdue: false }
    expect(buildDailyNotificationCopy(view)).toBeNull()
  })
})

describe('buildWeeklyNotificationCopy', () => {
  it('matches the exact given format', () => {
    const weekly = { ...slot(), weekday: 6, durationOption: 45 as const }
    expect(buildWeeklyNotificationCopy(weekly).body).toBe('Weekend session — 45 minutes')
  })
})

describe('isStandalone — the branches Settings.tsx reads', () => {
  it('is true when matchMedia reports standalone', () => {
    expect(isStandalone({ matchMediaStandalone: true, navigatorStandalone: false })).toBe(true)
  })

  it('is true when navigator.standalone is set (older iOS Safari)', () => {
    expect(isStandalone({ matchMediaStandalone: false, navigatorStandalone: true })).toBe(true)
  })

  it('is true when both signal it', () => {
    expect(isStandalone({ matchMediaStandalone: true, navigatorStandalone: true })).toBe(true)
  })

  it('is false when neither does — a plain browser tab', () => {
    expect(isStandalone({ matchMediaStandalone: false, navigatorStandalone: false })).toBe(false)
  })
})
