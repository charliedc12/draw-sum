/* Pure formatting and grouping for the Log screen. No store imports, no I/O. */

import type { Curriculum } from '../types/curriculum.ts'
import type { LogEntry } from './progression.ts'
import { findStep, findUnit } from './progression.ts'

export type LogGroup = {
  /** Sortable, e.g. "2026-08". */
  key: string
  /** Displayed, e.g. "August 2026". */
  label: string
  entries: LogEntry[]
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** "Wed 12 Aug" — spelled out manually so the format doesn't drift with locale. */
export function formatLogDate(iso: string): string {
  const d = new Date(iso)
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

function monthKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(iso: string): string {
  const d = new Date(iso)
  return `${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}`
}

/**
 * Reverse-chronological: newest month first, newest entry first within a month.
 * ISO 8601 timestamps sort correctly as plain strings, so no date parsing is needed
 * for the ordering itself.
 */
export function groupLogByMonth(log: LogEntry[]): LogGroup[] {
  const sorted = [...log].sort((a, b) => b.date.localeCompare(a.date))
  const groups = new Map<string, LogGroup>()

  for (const entry of sorted) {
    const key = monthKey(entry.date)
    let group = groups.get(key)
    if (!group) {
      group = { key, label: monthLabel(entry.date), entries: [] }
      groups.set(key, group)
    }
    group.entries.push(entry)
  }

  return [...groups.values()]
}

export type LogTarget = {
  name: string
  /** Only steps carry a fixed duration; a session's real length isn't tracked. */
  durationMin?: number
}

export function describeLogTarget(entry: LogEntry, curriculum: Curriculum): LogTarget {
  if (entry.targetKind === 'step') {
    const step = findStep(curriculum, entry.targetId)
    return step ? { name: step.name, durationMin: step.durationMin } : { name: 'A step' }
  }
  const unit = findUnit(curriculum, entry.targetId)
  return { name: unit ? unit.name : 'Session' }
}
