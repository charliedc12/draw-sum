import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { curriculum } from '../data/curriculum.ts'
import { beginSession, initialProgress } from '../logic/progression.ts'
import { useAppStore } from '../store/useAppStore.ts'
import Session from './Session.tsx'

function renderSession() {
  return render(
    <MemoryRouter>
      <Session />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useAppStore.setState(initialProgress(curriculum))
})

describe('duration picker', () => {
  it('shows exactly three duration buttons', () => {
    renderSession()
    expect(screen.getByRole('button', { name: /30/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /45/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /60/ })).toBeInTheDocument()
  })

  it('generates a staged session for the current phase on tap', async () => {
    renderSession()
    await userEvent.click(screen.getByRole('button', { name: /30/ }))

    const active = useAppStore.getState().activeSession
    expect(active?.phaseId).toBe('p1')
    expect(active?.durationOption).toBe(30)
  })
})

describe('the session runner', () => {
  beforeEach(() => {
    useAppStore.setState(beginSession(useAppStore.getState(), curriculum, 30))
  })

  it('shows the subject prominently', () => {
    renderSession()
    const kind = useAppStore.getState().activeSession?.subject.kind
    expect(
      screen.getByText(kind === 'fromLife' ? 'Draw, from life' : 'Draw, from reference'),
    ).toBeInTheDocument()
  })

  it('shows a checkbox per stage with its atMin timestamp', () => {
    renderSession()
    const template = curriculum.sessionTemplates.find(
      (t) => t.phaseId === 'p1' && t.durationOption === 30,
    )!
    expect(screen.getAllByRole('checkbox')).toHaveLength(template.stages.length)
    for (const stage of template.stages) {
      expect(screen.getByText(`${stage.atMin} min`)).toBeInTheDocument()
      expect(screen.getByText(stage.instruction)).toBeInTheDocument()
    }
  })

  it('starts at 0:00 and shows a Start button, not Pause or Resume', () => {
    renderSession()
    expect(screen.getByText('0:00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Resume' })).not.toBeInTheDocument()
  })

  it('Start begins the timer and swaps in Pause', async () => {
    renderSession()
    await userEvent.click(screen.getByRole('button', { name: 'Start' }))

    expect(useAppStore.getState().activeSession?.timer.startedAt).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument()
  })

  it('Pause freezes the timer and swaps in Resume', async () => {
    renderSession()
    await userEvent.click(screen.getByRole('button', { name: 'Start' }))
    await userEvent.click(screen.getByRole('button', { name: 'Pause' }))

    expect(useAppStore.getState().activeSession?.timer.pausedAt).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument()
  })

  it('checking a stage is purely manual and never blocks completion', async () => {
    renderSession()
    const boxes = screen.getAllByRole('checkbox')
    await userEvent.click(boxes[0])
    expect(useAppStore.getState().activeSession?.checkedStageIndices).toEqual([0])

    // Completion works with every other stage left unchecked.
    await userEvent.click(screen.getByRole('button', { name: 'Session complete' }))
    expect(useAppStore.getState().sessionCount).toBe(1)
  })

  it('never hard-cuts, auto-advances, or shows a countdown — no "time\'s up" text anywhere', () => {
    renderSession()
    const body = document.body.textContent ?? ''
    expect(body).not.toMatch(/time'?s up/i)
    expect(body).not.toMatch(/expired/i)
  })

  it('"Start a different session" discards the active session without logging anything', async () => {
    renderSession()
    await userEvent.click(screen.getByRole('button', { name: 'Start a different session' }))

    expect(useAppStore.getState().activeSession).toBeNull()
    expect(useAppStore.getState().sessionCount).toBe(0)
    expect(screen.getByText('How long do you have?')).toBeInTheDocument()
  })
})

describe('completing a session', () => {
  it('calls completeSession: increments sessionCount, resets debtCounter, logs the entry', async () => {
    useAppStore.setState(beginSession({ ...useAppStore.getState(), debtCounter: 10 }, curriculum, 30))
    renderSession()

    await userEvent.click(screen.getByRole('button', { name: 'Session complete' }))

    const state = useAppStore.getState()
    expect(state.sessionCount).toBe(1)
    expect(state.debtCounter).toBe(0)
    expect(state.log.some((e) => e.targetKind === 'session' && e.status === 'done')).toBe(true)
  })

  it('increments the current phase weekend unit reps', async () => {
    useAppStore.setState(beginSession(useAppStore.getState(), curriculum, 30))
    renderSession()

    await userEvent.click(screen.getByRole('button', { name: 'Session complete' }))

    expect(useAppStore.getState().unitRepCounts['u1.W']).toBe(1)
  })

  it('Phase 1 has no error tags, so completion returns straight to the picker screen state, not a tag list', async () => {
    useAppStore.setState(beginSession(useAppStore.getState(), curriculum, 30))
    renderSession()

    await userEvent.click(screen.getByRole('button', { name: 'Session complete' }))

    expect(screen.queryByText(/Anything you noticed/)).not.toBeInTheDocument()
  })

  it('a phase with error tags shows the multi-select list after completion', async () => {
    useAppStore.setState({ ...beginSession({ ...initialProgress(curriculum), currentPhaseId: 'p2' }, curriculum, 30) })
    renderSession()

    await userEvent.click(screen.getByRole('button', { name: 'Session complete' }))

    const p2 = curriculum.phases.find((p) => p.id === 'p2')!
    expect(screen.getByText(/Anything you noticed/)).toBeInTheDocument()
    for (const tag of p2.errorTags) {
      expect(screen.getByText(tag)).toBeInTheDocument()
    }
  })

  it('Skip and Save are given equal visual weight', async () => {
    useAppStore.setState({ ...beginSession({ ...initialProgress(curriculum), currentPhaseId: 'p2' }, curriculum, 30) })
    renderSession()
    await userEvent.click(screen.getByRole('button', { name: 'Session complete' }))

    const skip = screen.getByRole('button', { name: 'Skip' })
    const save = screen.getByRole('button', { name: 'Save' })
    expect(skip.className).toBe(save.className)
  })

  it('Save attaches the selected tags to the just-completed session entry', async () => {
    useAppStore.setState({ ...beginSession({ ...initialProgress(curriculum), currentPhaseId: 'p2' }, curriculum, 30) })
    renderSession()
    await userEvent.click(screen.getByRole('button', { name: 'Session complete' }))

    const p2 = curriculum.phases.find((p) => p.id === 'p2')!
    await userEvent.click(screen.getByText(p2.errorTags[0]))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    const entry = useAppStore.getState().log.find((e) => e.targetKind === 'session')
    expect(entry?.tags).toEqual([p2.errorTags[0]])
  })

  it('Skip attaches nothing', async () => {
    useAppStore.setState({ ...beginSession({ ...initialProgress(curriculum), currentPhaseId: 'p2' }, curriculum, 30) })
    renderSession()
    await userEvent.click(screen.getByRole('button', { name: 'Session complete' }))
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }))

    const entry = useAppStore.getState().log.find((e) => e.targetKind === 'session')
    expect(entry?.tags).toBeUndefined()
  })

  it('tags are never rendered back as a score, grade, or assessment anywhere on the flow', async () => {
    useAppStore.setState({ ...beginSession({ ...initialProgress(curriculum), currentPhaseId: 'p2' }, curriculum, 30) })
    renderSession()
    await userEvent.click(screen.getByRole('button', { name: 'Session complete' }))
    const body = document.body.textContent ?? ''
    for (const word of [/score/i, /grade/i, /rating/i]) {
      expect(body).not.toMatch(word)
    }
  })
})

describe('elapsed time across a simulated backgrounding gap', () => {
  it('recomputes from the stored start timestamp on the next render, not from a stale tick', () => {
    vi.useFakeTimers()
    try {
      const now = new Date('2026-08-01T10:00:00.000Z')
      vi.setSystemTime(now)

      let state = beginSession(useAppStore.getState(), curriculum, 30)
      state = { ...state, activeSession: { ...state.activeSession!, timer: { startedAt: now.toISOString(), pausedAt: null, accumulatedPauseMs: 0 } } }
      useAppStore.setState(state)

      const { unmount } = renderSession()

      // Simulate the tab backgrounded for 12 minutes (its interval suspended by iOS),
      // then foregrounded again.
      const later = new Date(now.getTime() + 12 * 60_000)
      vi.setSystemTime(later)
      unmount()
      renderSession()

      expect(screen.getByText('12:00')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})
