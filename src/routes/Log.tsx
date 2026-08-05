import { useEffect } from 'react'
import { curriculum } from '../data/curriculum.ts'
import { describeLogTarget, formatLogDate, groupLogByMonth } from '../logic/log.ts'
import type { LogEntry } from '../logic/progression.ts'
import { useAppStore } from '../store/useAppStore.ts'
import './Log.css'

export default function Log() {
  const log = useAppStore((s) => s.log)
  const drillCount = useAppStore((s) => s.drillCount)
  const sessionCount = useAppStore((s) => s.sessionCount)
  const hydrate = useAppStore((s) => s.hydrate)

  useEffect(() => {
    hydrate()
  }, [hydrate])

  const groups = groupLogByMonth(log)

  return (
    <section className="screen">
      <h1 className="screen__title">Log</h1>

      <div className="stats">
        <div className="stats__figure">
          <span className="stats__value">{drillCount}</span>
          <span className="stats__label">Drills</span>
        </div>
        <div className="stats__figure">
          <span className="stats__value">{sessionCount}</span>
          <span className="stats__label">Sessions</span>
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="log__empty">Nothing logged yet — Today has what to draw next.</p>
      ) : (
        <div className="log">
          {groups.map((group) => (
            <section key={group.key} className="log__month">
              <h2 className="log__monthHeader">{group.label}</h2>
              <ul className="log__entries">
                {group.entries.map((entry) => (
                  <LogRow key={entry.id} entry={entry} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  )
}

function LogRow({ entry }: { entry: LogEntry }) {
  const target = describeLogTarget(entry, curriculum)
  const date = formatLogDate(entry.date)

  if (entry.status === 'skipped') {
    return (
      <li className="log__row log__row--skipped">
        <span className="log__date">{date}</span>
        <span className="log__separator">·</span>
        <span className="log__name">{target.name}</span>
        <span className="log__separator">·</span>
        <span className="log__status">skipped</span>
      </li>
    )
  }

  return (
    <li className="log__row">
      <span className="log__date">{date}</span>
      <span className="log__separator">·</span>
      <span className="log__name">{target.name}</span>
      {target.durationMin !== undefined && (
        <>
          <span className="log__separator">·</span>
          <span className="log__duration">{target.durationMin} min</span>
        </>
      )}
      <span className="log__check" aria-hidden="true">✓</span>
    </li>
  )
}
