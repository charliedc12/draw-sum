import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { curriculum } from '../data/curriculum.ts'
import { initialProgress } from '../logic/progression.ts'
import { useAppStore } from '../store/useAppStore.ts'
import Today from './Today.tsx'

function renderToday() {
  return render(
    <MemoryRouter>
      <Today />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useAppStore.setState(initialProgress(curriculum))
})

describe('Today', () => {
  it('shows the first drill of Phase 1', () => {
    renderToday()

    expect(screen.getByText('PHASE 1 · UNIT 1.1 · STEP 1')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Straight lines, dot to dot, 20 reps' }),
    ).toBeInTheDocument()
    expect(screen.getByText('6 min · Pen')).toBeInTheDocument()
    expect(screen.getByText('Look at the endpoint, not the pen tip.')).toBeInTheDocument()
  })

  it('shows the subject and the common failure, labelled', () => {
    renderToday()

    expect(screen.getByText('Draw, from life')).toBeInTheDocument()
    expect(screen.getByText('A blank page. The marks are the subject.')).toBeInTheDocument()
    expect(screen.getByText('Common failure')).toBeInTheDocument()
    expect(
      screen.getByText(/Hooking the line at the far end because your eye followed the tip/),
    ).toBeInTheDocument()
  })

  it('offers Done, Skip and the shortcut link', () => {
    renderToday()

    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Less than five minutes?' }),
    ).toBeInTheDocument()
  })

  /* The product promise: the app never asks how the drawing turned out. */
  it('never asks the user to rate or judge the drawing', () => {
    renderToday()

    const body = document.body.textContent ?? ''
    for (const word of [/rate/i, /rating/i, /score/i, /how did/i, /quality/i, /good/i]) {
      expect(body).not.toMatch(word)
    }
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  })

  it('serves the next step after Done', async () => {
    renderToday()
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(screen.getByText('PHASE 1 · UNIT 1.1 · STEP 2')).toBeInTheDocument()
    expect(useAppStore.getState().drillCount).toBe(1)
  })

  it('serves the next step after Skip without counting progress', async () => {
    renderToday()
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }))

    expect(screen.getByText('PHASE 1 · UNIT 1.1 · STEP 2')).toBeInTheDocument()
    const state = useAppStore.getState()
    expect(state.drillCount).toBe(0)
    expect(state.debtCounter).toBe(0)
    expect(state.unitRepCounts['u1.1']).toBeUndefined()
  })

  it('replaces the card with the session prompt once debt is owed', () => {
    useAppStore.setState({ debtCounter: 10 })
    renderToday()

    expect(screen.getByRole('heading', { name: 'Time for a longer session' })).toBeInTheDocument()
    expect(screen.getByText('10 drills since your last one')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument()
    expect(screen.queryByText('Common failure')).not.toBeInTheDocument()
  })

  it('routes to /session — the only place in the app that blocks the normal flow', () => {
    useAppStore.setState({ debtCounter: 10 })
    renderToday()

    const link = screen.getByRole('link', { name: 'Start a session' })
    expect(link).toHaveAttribute('href', '/session')
  })

  it('explains a forced advance instead of leaving it unexplained', () => {
    useAppStore.setState({ forcedAdvance: true })
    renderToday()

    expect(screen.getByRole('status')).toHaveTextContent(/far more common, and far more damaging/)
  })
})

describe('the ninety-second floor', () => {
  it('reveals three micro-drill options on tap, none shown before that', () => {
    renderToday()
    for (const drill of curriculum.microDrills) {
      expect(screen.queryByRole('button', { name: drill.name })).not.toBeInTheDocument()
    }
  })

  it('shows the three curriculum micro-drills once opened', async () => {
    renderToday()
    await userEvent.click(screen.getByRole('button', { name: 'Less than five minutes?' }))

    expect(curriculum.microDrills).toHaveLength(3)
    for (const drill of curriculum.microDrills) {
      expect(screen.getByRole('button', { name: drill.name })).toBeInTheDocument()
    }
  })

  it('completing one increments drillCount but not debt or unit reps', async () => {
    renderToday()
    await userEvent.click(screen.getByRole('button', { name: 'Less than five minutes?' }))
    await userEvent.click(screen.getByRole('button', { name: curriculum.microDrills[0].name }))

    const state = useAppStore.getState()
    expect(state.drillCount).toBe(1)
    expect(state.debtCounter).toBe(0)
    expect(state.unitRepCounts).toEqual({})
    expect(state.log[0]).toMatchObject({ targetKind: 'microDrill', status: 'done' })
  })

  it('does not disturb the main step — the same drill is still next after', async () => {
    renderToday()
    await userEvent.click(screen.getByRole('button', { name: 'Less than five minutes?' }))
    await userEvent.click(screen.getByRole('button', { name: curriculum.microDrills[0].name }))

    expect(screen.getByText('PHASE 1 · UNIT 1.1 · STEP 1')).toBeInTheDocument()
  })

  it('"Never mind" collapses the picker without logging anything', async () => {
    renderToday()
    await userEvent.click(screen.getByRole('button', { name: 'Less than five minutes?' }))
    await userEvent.click(screen.getByRole('button', { name: 'Never mind' }))

    expect(screen.getByRole('button', { name: 'Less than five minutes?' })).toBeInTheDocument()
    expect(useAppStore.getState().log).toEqual([])
  })
})

describe('rising-standards cards', () => {
  it('is absent before day 42', () => {
    renderToday()
    expect(screen.queryByText(/Feeling worse about your drawings/)).not.toBeInTheDocument()
  })

  it('shows the exact given copy once day 42 is reached', () => {
    useAppStore.setState({
      firstUseDate: new Date(Date.now() - 42 * 86_400_000).toISOString(),
    })
    renderToday()
    expect(screen.getByText(/Feeling worse about your drawings right now is expected/)).toBeInTheDocument()
  })

  it('dismissing marks that milestone shown so it never reappears', async () => {
    useAppStore.setState({
      firstUseDate: new Date(Date.now() - 42 * 86_400_000).toISOString(),
    })
    renderToday()
    await userEvent.click(screen.getAllByRole('button', { name: 'Got it' })[0])

    expect(useAppStore.getState().risingStandardsShown).toContain(42)
    expect(screen.queryByText(/Feeling worse about your drawings/)).not.toBeInTheDocument()
  })

  it('is never framed as a failure, warning, or grade', () => {
    useAppStore.setState({
      firstUseDate: new Date(Date.now() - 42 * 86_400_000).toISOString(),
    })
    renderToday()
    const body = document.body.textContent ?? ''
    for (const word of [/warning/i, /you'?re behind/i, /score/i, /grade/i]) {
      expect(body).not.toMatch(word)
    }
  })
})

describe('redraw prompts', () => {
  it('is absent before day 7', () => {
    renderToday()
    expect(screen.queryByText('Redraw set')).not.toBeInTheDocument()
  })

  it('lists all six locked subjects once day 7 is reached', () => {
    useAppStore.setState({
      firstUseDate: new Date(Date.now() - 7 * 86_400_000).toISOString(),
    })
    renderToday()
    expect(screen.getByText('Redraw set')).toBeInTheDocument()
    for (const subject of curriculum.redrawSubjects) {
      expect(screen.getByText(new RegExp(subject.text))).toBeInTheDocument()
    }
  })

  it('explains why comparison matters and instructs keeping attempts together', () => {
    useAppStore.setState({
      firstUseDate: new Date(Date.now() - 7 * 86_400_000).toISOString(),
    })
    renderToday()
    expect(
      screen.getByText(/Keep every attempt of each subject together in one place/),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/your own sense of whether you're improving isn't trustworthy/),
    ).toBeInTheDocument()
  })

  it('checking the box logs completion — nothing more', async () => {
    useAppStore.setState({
      firstUseDate: new Date(Date.now() - 7 * 86_400_000).toISOString(),
    })
    renderToday()
    await userEvent.click(screen.getByRole('checkbox'))

    const state = useAppStore.getState()
    expect(state.redrawRoundsCompleted).toContain(7)
    expect(screen.queryByText('Redraw set')).not.toBeInTheDocument()
  })
})
