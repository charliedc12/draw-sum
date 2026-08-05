import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { curriculum } from '../data/curriculum.ts'
import { closeAllDailyUnits, initialProgress } from '../logic/progression.ts'
import { useAppStore } from '../store/useAppStore.ts'
import Gate from './Gate.tsx'

function renderGate() {
  return render(
    <MemoryRouter>
      <Gate />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useAppStore.setState(closeAllDailyUnits(initialProgress(curriculum), curriculum, 'p1'))
})

describe('Gate', () => {
  it('shows the full text of every gate statement for the current phase, untruncated', () => {
    renderGate()
    const p1 = curriculum.phases.find((p) => p.id === 'p1')!
    for (const statement of p1.gateStatements) {
      expect(screen.getByText(statement.text)).toBeInTheDocument()
    }
  })

  it('the Advance button is disabled in spirit — absent — until everything is ticked', () => {
    renderGate()
    expect(
      screen.queryByRole('button', { name: /Advance to Phase 2/ }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep practicing these' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Advance anyway' })).toBeInTheDocument()
  })

  it('ticks persist to the store as the user taps', async () => {
    renderGate()
    const p1 = curriculum.phases.find((p) => p.id === 'p1')!
    const firstBox = screen.getAllByRole('checkbox')[0]
    await userEvent.click(firstBox)
    expect(useAppStore.getState().gateTicks[p1.id]?.[0]).toBe(true)
  })

  it('ticks survive a re-render (leaving and returning)', async () => {
    const { unmount } = renderGate()
    await userEvent.click(screen.getAllByRole('checkbox')[0])
    unmount()
    renderGate()
    expect((screen.getAllByRole('checkbox')[0] as HTMLInputElement).checked).toBe(true)
  })

  it('shows Advance to Phase N once every statement is ticked', async () => {
    renderGate()
    for (const box of screen.getAllByRole('checkbox')) {
      await userEvent.click(box)
    }
    expect(screen.getByRole('button', { name: 'Advance to Phase 2' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Advance anyway' })).not.toBeInTheDocument()
  })

  it('advancing sets phaseEntryDate to now and moves currentPhaseId forward', async () => {
    renderGate()
    for (const box of screen.getAllByRole('checkbox')) {
      await userEvent.click(box)
    }
    const before = Date.now()
    await userEvent.click(screen.getByRole('button', { name: 'Advance to Phase 2' }))

    const state = useAppStore.getState()
    expect(state.currentPhaseId).toBe('p2')
    expect(new Date(state.phaseEntryDate).getTime()).toBeGreaterThanOrEqual(before)
  })

  it('starting a top-up reinjects only the units behind the unticked statements', async () => {
    renderGate()
    // Tick every statement except the last one.
    const boxes = screen.getAllByRole('checkbox')
    for (const box of boxes.slice(0, -1)) {
      await userEvent.click(box)
    }
    await userEvent.click(screen.getByRole('button', { name: 'Keep practicing these' }))

    const state = useAppStore.getState()
    expect(state.topUp?.phaseId).toBe('p1')
    expect(state.topUp?.statementIndices).toEqual([boxes.length - 1])
    expect(state.currentPhaseId).toBe('p1')
  })

  it('advance anyway asks for one confirmation, then advances regardless of ticks', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderGate()
    await userEvent.click(screen.getByRole('button', { name: 'Advance anyway' }))

    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect(useAppStore.getState().currentPhaseId).toBe('p2')
    vi.restoreAllMocks()
  })

  it('declining the confirmation leaves the phase untouched', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderGate()
    await userEvent.click(screen.getByRole('button', { name: 'Advance anyway' }))

    expect(useAppStore.getState().currentPhaseId).toBe('p1')
    vi.restoreAllMocks()
  })

  it('uses neutral copy — no pass/fail/celebration language anywhere on the screen', () => {
    renderGate()
    const body = document.body.textContent ?? ''
    for (const word of [/you passed/i, /you failed/i, /great job/i, /congratulations/i]) {
      expect(body).not.toMatch(word)
    }
  })

  it('the terminal phase explains there is no gate rather than showing an empty checklist', () => {
    useAppStore.setState(
      closeAllDailyUnits(
        { ...initialProgress(curriculum), currentPhaseId: 'p6' },
        curriculum,
        'p6',
      ),
    )
    renderGate()
    expect(screen.getByText(/doesn't have a gate/)).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })
})
