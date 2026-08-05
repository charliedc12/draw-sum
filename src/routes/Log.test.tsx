import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { curriculum } from '../data/curriculum.ts'
import { initialProgress } from '../logic/progression.ts'
import type { LogEntry } from '../logic/progression.ts'
import { useAppStore } from '../store/useAppStore.ts'
import Log from './Log.tsx'

function entry(overrides: Partial<LogEntry>): LogEntry {
  return {
    id: Math.random().toString(36),
    targetId: 's1.1.1',
    targetKind: 'step',
    date: '2026-08-12T09:00:00.000Z',
    status: 'done',
    ...overrides,
  }
}

beforeEach(() => {
  useAppStore.setState(initialProgress(curriculum))
})

describe('Log', () => {
  it('shows a neutral empty state pointing at Today, with no encouragement copy', () => {
    render(<Log />)
    expect(screen.getByText(/Today has what to draw next/)).toBeInTheDocument()
  })

  it('shows drill and session counts as two separate figures', () => {
    useAppStore.setState({ drillCount: 5, sessionCount: 2 })
    render(<Log />)
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('Drills')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('Sessions')).toBeInTheDocument()
  })

  it('renders a done entry with date, name, duration and a checkmark', () => {
    useAppStore.setState({
      log: [entry({ targetId: 's1.1.1', status: 'done' })],
    })
    render(<Log />)
    expect(screen.getByText('Wed 12 Aug')).toBeInTheDocument()
    expect(screen.getByText('Straight lines, dot to dot, 20 reps')).toBeInTheDocument()
    expect(screen.getByText('6 min')).toBeInTheDocument()
    expect(screen.getByText('✓')).toBeInTheDocument()
  })

  it('renders a skipped entry distinctly, with no duration and no checkmark', () => {
    useAppStore.setState({
      log: [entry({ targetId: 's1.1.1', status: 'skipped' })],
    })
    render(<Log />)
    const row = screen.getByText('skipped').closest('li')!
    expect(row).toHaveClass('log__row--skipped')
    expect(row.textContent).not.toContain('min')
    expect(screen.queryByText('✓')).not.toBeInTheDocument()
  })

  it('groups entries under a month header', () => {
    useAppStore.setState({
      log: [
        entry({ id: 'a', date: '2026-08-01T09:00:00.000Z' }),
        entry({ id: 'b', date: '2026-07-15T09:00:00.000Z' }),
      ],
    })
    render(<Log />)
    expect(screen.getByText('August 2026')).toBeInTheDocument()
    expect(screen.getByText('July 2026')).toBeInTheDocument()
  })

  it('orders entries newest first', () => {
    useAppStore.setState({
      log: [
        entry({ id: 'a', date: '2026-08-01T09:00:00.000Z' }),
        entry({ id: 'b', date: '2026-08-20T09:00:00.000Z' }),
      ],
    })
    render(<Log />)
    const rows = screen.getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('20 Aug')
    expect(rows[1]).toHaveTextContent('1 Aug')
  })

  it('never renders an image, thumbnail, or upload affordance', () => {
    useAppStore.setState({ log: [entry({})] })
    const { container } = render(<Log />)
    expect(container.querySelectorAll('img')).toHaveLength(0)
    expect(container.querySelector('input[type="file"]')).toBeNull()
  })
})
