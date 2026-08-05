import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { curriculum } from '../data/curriculum.ts'
import { initialProgress, markStepDone } from '../logic/progression.ts'
import { useAppStore } from '../store/useAppStore.ts'
import Path from './Path.tsx'

function renderPath() {
  return render(
    <MemoryRouter>
      <Path />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useAppStore.setState(initialProgress(curriculum))
})

describe('Path', () => {
  it('lists all six phases, not just the current one', () => {
    renderPath()
    for (const phase of curriculum.phases) {
      expect(screen.getByText(`PHASE ${phase.order}`)).toBeInTheDocument()
      expect(screen.getByText(phase.name)).toBeInTheDocument()
    }
  })

  it('expands the current phase and collapses the rest by default', () => {
    renderPath()
    expect(screen.getByRole('button', { name: /Line control/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(screen.getByRole('button', { name: /Observation/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    // Steps of a collapsed phase are not rendered — but the phase name itself still is.
    expect(screen.queryByText('One object, its 5-8 major angles only, as straight lines')).not
      .toBeInTheDocument()
  })

  it('toggles a phase open and closed on click', async () => {
    renderPath()
    const header = screen.getByRole('button', { name: /Observation/ })
    await userEvent.click(header)
    expect(header).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(header)
    expect(header).toHaveAttribute('aria-expanded', 'false')
  })

  it('never hides, locks, or blurs a future phase — its content renders in the DOM', async () => {
    renderPath()
    const header = screen.getByRole('button', { name: /People and faces/ })
    await userEvent.click(header)
    expect(screen.getByText(/Gesture/)).toBeInTheDocument()
    expect(screen.getByText(/Head construction/)).toBeInTheDocument()
  })

  it('shows unit rep progress as a fraction, not a percentage', () => {
    renderPath()
    expect(screen.getByText('0 / 8')).toBeInTheDocument()
    expect(screen.queryByText('%')).not.toBeInTheDocument()
  })

  it('shows a rep count that reflects real progress after a drill', () => {
    useAppStore.setState(markStepDone(useAppStore.getState(), curriculum, 's1.1.1'))
    renderPath()
    expect(screen.getByText('1 / 8')).toBeInTheDocument()
  })

  it('classifies completed, current and upcoming steps within the first unit', () => {
    let state = markStepDone(useAppStore.getState(), curriculum, 's1.1.1')
    state = markStepDone(state, curriculum, 's1.1.1')
    useAppStore.setState(state)
    renderPath()

    const marksHeader = screen.getByText('1.1 · Marks').closest('.unit')!
    const rows = within(marksHeader as HTMLElement).getAllByRole('listitem')
    // s1.1.1 done twice -> completed; round robin now points at s1.1.2 -> current; rest upcoming.
    expect(rows[0]).toHaveAttribute('data-status', 'completed')
    expect(rows[1]).toHaveAttribute('data-status', 'current')
    expect(rows[2]).toHaveAttribute('data-status', 'upcoming')
    expect(rows[3]).toHaveAttribute('data-status', 'upcoming')
  })

  it('only links to Progress from the current phase, not from others', async () => {
    renderPath()
    expect(screen.getAllByRole('link', { name: /See progress/ })).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: /Observation/ }))
    expect(screen.getAllByRole('link', { name: /See progress/ })).toHaveLength(1)
  })

  describe('long-press to jump phases', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    })
    afterEach(() => {
      vi.useRealTimers()
      vi.restoreAllMocks()
    })

    it('asks for confirmation and jumps on a 600ms hold', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      renderPath()

      const header = screen.getByRole('button', { name: /People and faces/ })
      fireEvent.pointerDown(header)
      await act(async () => {
        vi.advanceTimersByTime(650)
      })

      expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Phase 5'))
      expect(useAppStore.getState().currentPhaseId).toBe('p5')
    })

    it('does nothing when the confirmation is declined', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false)
      renderPath()

      const header = screen.getByRole('button', { name: /People and faces/ })
      fireEvent.pointerDown(header)
      await act(async () => {
        vi.advanceTimersByTime(650)
      })

      expect(useAppStore.getState().currentPhaseId).toBe('p1')
    })

    it('releasing before 600ms cancels the hold — no dialog, no jump', async () => {
      vi.spyOn(window, 'confirm')
      renderPath()

      const header = screen.getByRole('button', { name: /People and faces/ })
      fireEvent.pointerDown(header)
      await act(async () => {
        vi.advanceTimersByTime(300)
      })
      fireEvent.pointerUp(header)
      await act(async () => {
        vi.advanceTimersByTime(650)
      })

      expect(window.confirm).not.toHaveBeenCalled()
      expect(useAppStore.getState().currentPhaseId).toBe('p1')
    })

    it('a short tap does not trigger the jump, only the toggle', () => {
      vi.spyOn(window, 'confirm')
      renderPath()

      const header = screen.getByRole('button', { name: /Observation/ })
      fireEvent.pointerDown(header)
      fireEvent.pointerUp(header)
      fireEvent.click(header)

      expect(window.confirm).not.toHaveBeenCalled()
      expect(header).toHaveAttribute('aria-expanded', 'true')
    })
  })
})
