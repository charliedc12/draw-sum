import { useState } from 'react'
import { curriculum } from '../data/curriculum.ts'
import { formatLogAsText } from '../logic/log.ts'
import { findPhase } from '../logic/progression.ts'
import {
  detectStandalone,
  getNotificationPermission,
  requestNotificationPermission,
} from '../notifications/scheduler.ts'
import type { PermissionState } from '../notifications/scheduler.ts'
import { useAppStore } from '../store/useAppStore.ts'
import DevPanel from './DevPanel.tsx'
import './Settings.css'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function Settings() {
  return (
    <section className="screen">
      <h1 className="screen__title">Settings</h1>

      <NotificationSection />
      <PhaseOverrideSection />
      <LogExportSection />
      <ResetSection />

      {/* Statically false in production — Vite dead-code-eliminates this branch and
          DevPanel along with it, so there is no reachable entry point in a prod build. */}
      {import.meta.env.DEV && <DevPanel />}
    </section>
  )
}

// ---- notifications -----------------------------------------------------------

function NotificationSection() {
  const [standalone] = useState(detectStandalone)
  const [permission, setPermission] = useState<PermissionState>(getNotificationPermission)

  async function enable() {
    const result = await requestNotificationPermission()
    setPermission(result)
  }

  return (
    <div className="settingsBlock">
      <h2 className="settingsBlock__title">Notifications</h2>

      {!standalone && (
        <div className="settingsBlock__note">
          <p>
            Notifications only work once DrawPath is added to your home screen — iOS
            doesn't allow them for a page open in Safari.
          </p>
          <ol className="settingsBlock__steps">
            <li>Tap the Share icon in Safari's toolbar.</li>
            <li>Scroll down and tap "Add to Home Screen".</li>
            <li>Open DrawPath from the icon on your home screen, then come back here.</li>
          </ol>
        </div>
      )}

      {standalone && permission === 'unsupported' && (
        <p className="settingsBlock__note">
          This browser doesn't support notifications.
        </p>
      )}

      {standalone && permission === 'denied' && (
        <p className="settingsBlock__note">
          Notifications are turned off for DrawPath. A web app can't ask again once
          you've said no — to turn them back on, open iOS Settings → DrawPath →
          Notifications.
        </p>
      )}

      {standalone && permission === 'default' && (
        <div className="settingsBlock__note">
          <p>Turn on notifications to schedule reminders below.</p>
          <button type="button" className="settingsBlock__button" onClick={enable}>
            Enable notifications
          </button>
        </div>
      )}

      {standalone && permission === 'granted' && (
        <div className="notificationSlots">
          <DailySlotRow index={0} label="First reminder" />
          <DailySlotRow index={1} label="Second reminder" />
          <WeeklySlotRow />
        </div>
      )}
    </div>
  )
}

function DailySlotRow({ index, label }: { index: 0 | 1; label: string }) {
  const slot = useAppStore((s) => s.notificationSettings.daily[index])
  const setDailyNotificationSlot = useAppStore((s) => s.setDailyNotificationSlot)

  return (
    <div className="notificationSlot">
      <label className="notificationSlot__toggleRow">
        <input
          type="checkbox"
          className="notificationSlot__checkbox"
          checked={slot.enabled}
          onChange={(e) => setDailyNotificationSlot(index, { enabled: e.target.checked })}
        />
        <span>{label}</span>
      </label>
      <input
        type="time"
        className="notificationSlot__time"
        value={formatTimeValue(slot.hour, slot.minute)}
        onChange={(e) => {
          const [hour, minute] = parseTimeValue(e.target.value)
          setDailyNotificationSlot(index, { hour, minute })
        }}
        aria-label={`${label} time`}
      />
    </div>
  )
}

function WeeklySlotRow() {
  const slot = useAppStore((s) => s.notificationSettings.weekly)
  const setWeeklyNotificationSlot = useAppStore((s) => s.setWeeklyNotificationSlot)

  return (
    <div className="notificationSlot">
      <label className="notificationSlot__toggleRow">
        <input
          type="checkbox"
          className="notificationSlot__checkbox"
          checked={slot.enabled}
          onChange={(e) => setWeeklyNotificationSlot({ enabled: e.target.checked })}
        />
        <span>Weekly session reminder</span>
      </label>
      <div className="notificationSlot__row">
        <select
          className="notificationSlot__select"
          value={slot.weekday}
          onChange={(e) => setWeeklyNotificationSlot({ weekday: Number(e.target.value) })}
          aria-label="Weekly reminder day"
        >
          {WEEKDAYS.map((day, i) => (
            <option key={day} value={i}>
              {day}
            </option>
          ))}
        </select>
        <input
          type="time"
          className="notificationSlot__time"
          value={formatTimeValue(slot.hour, slot.minute)}
          onChange={(e) => {
            const [hour, minute] = parseTimeValue(e.target.value)
            setWeeklyNotificationSlot({ hour, minute })
          }}
          aria-label="Weekly reminder time"
        />
      </div>
    </div>
  )
}

function formatTimeValue(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function parseTimeValue(value: string): [number, number] {
  const [h, m] = value.split(':').map(Number)
  return [Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0]
}

// ---- phase override -----------------------------------------------------------

/** Same guarantee as Path's long-press: either direction, one confirmation, every
    counter untouched. A plain tap here since Settings isn't a scrolling daily list. */
function PhaseOverrideSection() {
  const currentPhaseId = useAppStore((s) => s.currentPhaseId)
  const setPhase = useAppStore((s) => s.setPhase)

  function jumpTo(phaseId: string) {
    const phase = findPhase(curriculum, phaseId)
    if (!phase) return
    const ok = window.confirm(
      `Jump to Phase ${phase.order} — ${phase.name}? Your progress everywhere else is kept, and you can jump back any time.`,
    )
    if (!ok) return
    setPhase(phaseId)
  }

  return (
    <div className="settingsBlock">
      <h2 className="settingsBlock__title">Phase</h2>
      <div className="phaseOverride">
        {curriculum.phases.map((phase) => (
          <button
            key={phase.id}
            type="button"
            className="phaseOverride__button"
            data-active={phase.id === currentPhaseId}
            onClick={() => jumpTo(phase.id)}
          >
            {phase.order}. {phase.name}
          </button>
        ))}
      </div>
    </div>
  )
}

// ---- log export -----------------------------------------------------------

type CopyState = 'idle' | 'copied' | 'failed'

function LogExportSection() {
  const log = useAppStore((s) => s.log)
  const [copyState, setCopyState] = useState<CopyState>('idle')

  async function copyToClipboard() {
    const text = formatLogAsText(log, curriculum)
    try {
      await navigator.clipboard.writeText(text)
      setCopyState('copied')
    } catch {
      // Clipboard access can be denied by the browser — say so; download still works.
      setCopyState('failed')
    }
    setTimeout(() => setCopyState('idle'), 2000)
  }

  function download() {
    const text = formatLogAsText(log, curriculum)
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `drawpath-log-${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="settingsBlock">
      <h2 className="settingsBlock__title">Export log</h2>
      <div className="settingsBlock__row">
        <button type="button" className="settingsBlock__button" onClick={copyToClipboard}>
          {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? "Couldn't copy" : 'Copy to clipboard'}
        </button>
        <button type="button" className="settingsBlock__button" onClick={download}>
          Download .txt
        </button>
      </div>
      {copyState === 'failed' && (
        <p className="settingsBlock__note">
          Clipboard access was denied — the download button still works.
        </p>
      )}
    </div>
  )
}

// ---- full reset -----------------------------------------------------------

function ResetSection() {
  const resetAll = useAppStore((s) => s.resetAll)

  function handleReset() {
    const first = window.confirm(
      'This erases all progress, all settings and your entire log. This cannot be undone. Continue?',
    )
    if (!first) return
    const second = window.confirm(
      'Are you sure? This is final — there is no way to recover anything after this.',
    )
    if (!second) return
    resetAll()
  }

  return (
    <div className="settingsBlock">
      <h2 className="settingsBlock__title">Reset</h2>
      <p className="settingsBlock__note">
        Erases every drill, session, phase, and setting and starts over from nothing.
        This cannot be undone.
      </p>
      <button
        type="button"
        className="settingsBlock__button settingsBlock__button--danger"
        onClick={handleReset}
      >
        Reset everything
      </button>
    </div>
  )
}
