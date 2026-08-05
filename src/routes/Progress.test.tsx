import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { curriculum } from '../data/curriculum.ts'
import { initialProgress } from '../logic/progression.ts'
import { useAppStore } from '../store/useAppStore.ts'
import Progress from './Progress.tsx'

beforeEach(() => {
  useAppStore.setState(initialProgress(curriculum))
})

describe('Progress', () => {
  it('shows the current phase, weeks elapsed, and maxWeeks as plain text', () => {
    render(<Progress />)
    expect(screen.getByText('Phase 1 — Line control')).toBeInTheDocument()
    expect(screen.getByText('0 of 5 weeks')).toBeInTheDocument()
  })

  it('shows phase completion as closed units over total units', () => {
    render(<Progress />)
    expect(screen.getByText('0 of 4 units closed')).toBeInTheDocument()
  })

  it('reflects an actually-closed unit in the count', () => {
    useAppStore.setState({ unitRepCounts: { 'u1.1': 8 } })
    render(<Progress />)
    expect(screen.getByText('1 of 4 units closed')).toBeInTheDocument()
  })

  it('shows drill and session counts as two separate figures, not combined', () => {
    useAppStore.setState({ drillCount: 20, sessionCount: 3 })
    render(<Progress />)
    expect(screen.getByText('20')).toBeInTheDocument()
    expect(screen.getByText('Drills')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Sessions')).toBeInTheDocument()
    // No merged or averaged figure.
    expect(screen.queryByText('23')).not.toBeInTheDocument()
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
  })

  it('shows the low-session note only once sessions fall under a tenth of drills', () => {
    useAppStore.setState({ drillCount: 50, sessionCount: 6 })
    const { rerender } = render(<Progress />)
    expect(screen.queryByText(/builds line control but not/)).not.toBeInTheDocument()

    useAppStore.setState({ drillCount: 50, sessionCount: 4 })
    rerender(<Progress />)
    expect(screen.getByText(/builds line control but not/)).toBeInTheDocument()
  })

  it('shows the gate checklist read-only, reflecting ticks without a way to change them', () => {
    useAppStore.setState({ gateTicks: { p1: [true, false, false, false] } })
    render(<Progress />)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    const p1 = curriculum.phases.find((p) => p.id === 'p1')!
    for (const statement of p1.gateStatements) {
      expect(screen.getByText(statement.text)).toBeInTheDocument()
    }
  })

  it('renders nothing beyond the specified sections — no chart, graph, or percentage element', () => {
    const { container } = render(<Progress />)
    expect(container.querySelector('canvas')).toBeNull()
    expect(container.querySelector('svg')).toBeNull()
    expect(container.textContent).not.toMatch(/skill level/i)
  })
})
