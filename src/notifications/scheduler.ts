/* The only file in the app that touches the real Notification / ServiceWorker /
   matchMedia browser APIs. Everything decision-worthy (which slots are due, what the
   copy says, whether standalone mode counts) lives in src/logic/notifications.ts as
   pure functions — this file just wires those decisions to the platform.

   Structural honesty: this app makes no network requests and has no backend (see
   CLAUDE.md), so there is no push server. These notifications are best-effort and
   foreground-triggered — checked whenever the app is open or has just been reopened,
   fired then via the service worker. They cannot reliably fire while the app has been
   closed for a long stretch; true background delivery on iOS requires Apple Push
   Notification service via a server, which this project deliberately doesn't have. */

import { curriculum } from '../data/curriculum.ts'
import { getTodayStep } from '../logic/progression.ts'
import type { ProgressState } from '../logic/progression.ts'
import {
  buildDailyNotificationCopy,
  buildWeeklyNotificationCopy,
  getDueNotifications,
  isStandalone,
} from '../logic/notifications.ts'
import type { DueNotification, NotificationCopy } from '../logic/notifications.ts'

/** How often the app checks for a due notification while it's open. */
export const CHECK_INTERVAL_MS = 60_000

export function detectStandalone(): boolean {
  const matchMediaStandalone =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(display-mode: standalone)').matches
      : false
  const navigatorStandalone =
    typeof navigator !== 'undefined' &&
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  return isStandalone({ matchMediaStandalone, navigatorStandalone })
}

export type PermissionState = 'unsupported' | NotificationPermission

export function getNotificationPermission(): PermissionState {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
}

/** Only ever called from a direct user gesture (a button tap) — never on load. */
export async function requestNotificationPermission(): Promise<PermissionState> {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.requestPermission()
}

async function fireNotification(copy: NotificationCopy): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  const registration = await navigator.serviceWorker.ready
  await registration.showNotification(copy.title, { body: copy.body })
}

function copyFor(due: DueNotification, state: ProgressState, now: Date): NotificationCopy | null {
  if (due.kind === 'weekly') return buildWeeklyNotificationCopy(state.notificationSettings.weekly)
  const view = getTodayStep(state, curriculum, now)
  return buildDailyNotificationCopy(view)
}

/**
 * Checks for and fires any due notifications right now. Returns the list actually
 * fired, so the caller can mark them recorded. A no-op unless standalone and granted —
 * this function itself never explains why to the user; that's Settings.tsx's job.
 */
export async function checkAndFireDueNotifications(
  state: ProgressState,
  now: Date = new Date(),
): Promise<DueNotification[]> {
  if (!detectStandalone()) return []
  if (getNotificationPermission() !== 'granted') return []

  const due = getDueNotifications(state.notificationSettings, now)
  const fired: DueNotification[] = []
  for (const item of due) {
    const copy = copyFor(item, state, now)
    if (!copy) continue
    await fireNotification(copy)
    fired.push(item)
  }
  return fired
}
