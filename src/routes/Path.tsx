import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { curriculum } from '../data/curriculum.ts'
import { classifyPhase, classifyStep, classifyUnit } from '../logic/progression.ts'
import type { Phase, Step, Unit } from '../types/curriculum.ts'
import { useAppStore } from '../store/useAppStore.ts'
import './Path.css'

const LONG_PRESS_MS = 600

export default function Path() {
  const state = useAppStore()
  const { hydrate, setPhase } = state

  useEffect(() => {
    hydrate()
  }, [hydrate])

  // Captured once, from whatever the store already knows on mount — a later forced
  // advance shouldn't silently re-collapse a section the user opened by hand.
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => ({
    [useAppStore.getState().currentPhaseId]: true,
  }))

  function toggle(phaseId: string) {
    setExpanded((prev) => ({ ...prev, [phaseId]: !prev[phaseId] }))
  }

  function jumpToPhase(phase: Phase) {
    const ok = window.confirm(
      `Jump to Phase ${phase.order} — ${phase.name}? Your progress everywhere else is kept, and you can jump back any time.`,
    )
    if (!ok) return
    setPhase(phase.id)
    setExpanded((prev) => ({ ...prev, [phase.id]: true }))
  }

  return (
    <section className="screen">
      <h1 className="screen__title">Path</h1>

      <div className="phaseList">
        {curriculum.phases.map((phase) => (
          <PhaseSection
            key={phase.id}
            phase={phase}
            isExpanded={Boolean(expanded[phase.id])}
            onToggle={() => toggle(phase.id)}
            onLongPress={() => jumpToPhase(phase)}
          />
        ))}
      </div>
    </section>
  )
}

function PhaseSection({
  phase,
  isExpanded,
  onToggle,
  onLongPress,
}: {
  phase: Phase
  isExpanded: boolean
  onToggle: () => void
  onLongPress: () => void
}) {
  const status = useAppStore((s) => classifyPhase(s, curriculum, phase))
  const units = phase.unitIds
    .map((id) => curriculum.units.find((u) => u.id === id))
    .filter((u): u is Unit => u !== undefined)
  const longPress = useLongPress(onLongPress, LONG_PRESS_MS)

  return (
    <section className="phase" data-status={status}>
      <button
        type="button"
        className="phase__header"
        aria-expanded={isExpanded}
        onClick={(event) => {
          if (longPress.consumeClick()) {
            event.preventDefault()
            return
          }
          onToggle()
        }}
        {...longPress.handlers}
      >
        <span className="phase__heading">
          <span className="phase__eyebrow">PHASE {phase.order}</span>
          <span className="phase__name">{phase.name}</span>
        </span>
        <span className="phase__chevron" aria-hidden="true">
          {isExpanded ? '▾' : '▸'}
        </span>
      </button>

      {isExpanded && (
        <div className="phase__body">
          {units.map((unit) => (
            <UnitBlock key={unit.id} unit={unit} />
          ))}

          {status === 'current' && (
            <Link to="/progress" className="phase__progressLink">
              See progress in {phase.name} →
            </Link>
          )}
        </div>
      )}
    </section>
  )
}

function UnitBlock({ unit }: { unit: Unit }) {
  const status = useAppStore((s) => classifyUnit(s, curriculum, unit))
  const reps = useAppStore((s) => s.unitRepCounts[unit.id] ?? 0)
  const steps = unit.stepIds
    .map((id) => curriculum.steps.find((s) => s.id === id))
    .filter((s): s is Step => s !== undefined)

  return (
    <div className="unit" data-status={status}>
      <div className="unit__header">
        <span className="unit__name">{unitLabel(unit.id)} · {unit.name}</span>
        <span className="unit__reps">
          {reps} / {unit.requiredReps}
        </span>
      </div>
      <ul className="unit__steps">
        {steps.map((step) => (
          <StepRow key={step.id} step={step} />
        ))}
      </ul>
    </div>
  )
}

function StepRow({ step }: { step: Step }) {
  const status = useAppStore((s) => classifyStep(s, curriculum, step))
  return (
    <li className="step" data-status={status}>
      <span className="step__mark" aria-hidden="true">
        {status === 'completed' ? '●' : status === 'current' ? '○' : '·'}
      </span>
      <span className="step__name">{step.name}</span>
    </li>
  )
}

/* Unit IDs carry their own label: u1.W renders as "1.W". See CLAUDE.md. */
function unitLabel(unitId: string): string {
  return unitId.replace(/^u/, '')
}

/**
 * Press-and-hold, distinguished from a tap by a timer rather than by movement — good
 * enough for a header that doesn't scroll under the finger. `consumeClick` swallows
 * the click that follows a long press so it doesn't also toggle the section.
 */
function useLongPress(onLongPress: () => void, ms: number) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fired = useRef(false)

  function clear() {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }

  function start() {
    fired.current = false
    clear()
    timer.current = setTimeout(() => {
      fired.current = true
      onLongPress()
    }, ms)
  }

  function consumeClick() {
    if (!fired.current) return false
    fired.current = false
    return true
  }

  return {
    consumeClick,
    handlers: {
      onPointerDown: start,
      onPointerUp: clear,
      onPointerLeave: clear,
      onPointerCancel: clear,
    },
  }
}
