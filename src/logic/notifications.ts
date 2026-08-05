/* Pure notification scheduling and copy. No browser API calls here — Notification,
   ServiceWorkerRegistration, matchMedia and navigator.standalone all live in
   src/notifications/scheduler.ts, which calls into this module for the decisions.

   A structural note worth being honest about: this app has no backend and makes no
   network requests (see CLAUDE.md). Real background delivery on iOS requires Apple
   Push Notification service, which requires a server sending timed pushes — that's
   off the table here. What this module supports instead is best-effort, foreground-
   triggered notifications: due times are checked whenever the app is open or just
   reopened, and shown then via the service worker. They will not fire while the app
   has been closed for a long stretch. */

import type { DurationOption } from '../types/curriculum.ts'
import type { TodayView } from './progression.ts'

export type NotificationSlot = {
  /** 0–23. */
  hour: number
  /** 0–59. */
  minute: number
  enabled: boolean
  /** ISO timestamp of the last time this slot actually fired, or null if never. */
  lastFiredAt: string | null
}

export type WeeklyNotificationSlot = NotificationSlot & {
  /** 0 (Sunday) through 6 (Saturday), matching Date#getDay(). */
  weekday: number
  /** Which length to name in the reminder's copy — doesn't pre-select anything. */
  durationOption: DurationOption
}

export type NotificationSettings = {
  /** Exactly two — "max two per day" is a structural limit, not a UI suggestion. */
  daily: [NotificationSlot, NotificationSlot]
  weekly: WeeklyNotificationSlot
}

export function defaultNotificationSettings(): NotificationSettings {
  return {
    daily: [
      { hour: 9, minute: 0, enabled: false, lastFiredAt: null },
      { hour: 19, minute: 0, enabled: false, lastFiredAt: null },
    ],
    weekly: {
      hour: 10,
      minute: 0,
      weekday: 6,
      enabled: false,
      lastFiredAt: null,
      durationOption: 45,
    },
  }
}

function triggerTimeToday(slot: { hour: number; minute: number }, now: Date): Date {
  const t = new Date(now)
  t.setHours(slot.hour, slot.minute, 0, 0)
  return t
}

/**
 * A slot is due once today's (or, for weekly, this weekday's) scheduled time has
 * passed and it hasn't already fired since. Re-arms itself automatically the next day
 * (or the next matching weekday) — no separate "reset" bookkeeping needed, since
 * `lastFiredAt` from the previous occurrence is always before the new trigger time.
 */
export function isSlotDue(slot: NotificationSlot, now: Date): boolean {
  if (!slot.enabled) return false
  const trigger = triggerTimeToday(slot, now)
  if (now.getTime() < trigger.getTime()) return false
  if (!slot.lastFiredAt) return true
  return new Date(slot.lastFiredAt).getTime() < trigger.getTime()
}

export function isWeeklySlotDue(slot: WeeklyNotificationSlot, now: Date): boolean {
  if (now.getDay() !== slot.weekday) return false
  return isSlotDue(slot, now)
}

export type DueNotification = { kind: 'daily'; index: 0 | 1 } | { kind: 'weekly' }

/** Every slot that's due right now — there can be more than one if the app was closed
    across several trigger times; each still only ever fires once per occurrence. */
export function getDueNotifications(
  settings: NotificationSettings,
  now: Date = new Date(),
): DueNotification[] {
  const due: DueNotification[] = []
  settings.daily.forEach((slot, index) => {
    if (isSlotDue(slot, now)) due.push({ kind: 'daily', index: index as 0 | 1 })
  })
  if (isWeeklySlotDue(settings.weekly, now)) due.push({ kind: 'weekly' })
  return due
}

export type NotificationCopy = { title: string; body: string }

/**
 * Task-naming only, matching the current Today step exactly — e.g.
 * "Phase 3 · Unit 3.2 · Step 2 — 8 minutes". Never mentions time away, streaks, or
 * anything the user might read as a warning. Returns null when there's genuinely
 * nothing to name (no phase, or empty) — silence beats a message this app has no
 * neutral way to phrase.
 */
export function buildDailyNotificationCopy(view: TodayView): NotificationCopy | null {
  if (view.kind === 'step') {
    // Duplicated from progression.ts's unitLabel rather than imported, to avoid a
    // circular module dependency — progression.ts already imports from this file.
    const unitLabel = view.unit.id.replace(/^u/, '')
    return {
      title: 'DrawPath',
      body:
        `Phase ${view.phase.order} · Unit ${unitLabel} · Step ${view.stepNumber}` +
        ` — ${view.step.durationMin} minutes`,
    }
  }
  if (view.kind === 'gate') {
    return { title: 'DrawPath', body: `Phase ${view.phase.order} gate is open` }
  }
  if (view.kind === 'session') {
    return { title: 'DrawPath', body: 'A longer session is next' }
  }
  return null
}

export function buildWeeklyNotificationCopy(slot: WeeklyNotificationSlot): NotificationCopy {
  return { title: 'DrawPath', body: `Weekend session — ${slot.durationOption} minutes` }
}

// ---- standalone-mode detection (pure decision, injected inputs for testability) ----

/**
 * iOS only allows notifications for a PWA installed to the home screen. `matchMedia`
 * covers Android and desktop installs too; `navigator.standalone` is the iOS-specific
 * signal matchMedia sometimes misses on older Safari versions — either one is enough.
 */
export function isStandalone(env: {
  matchMediaStandalone: boolean
  navigatorStandalone: boolean
}): boolean {
  return env.matchMediaStandalone || env.navigatorStandalone
}
