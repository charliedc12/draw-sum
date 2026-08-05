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

  it('clears the debt when the session is marked done', async () => {
    useAppStore.setState({ debtCounter: 10 })
    renderToday()
    await userEvent.click(screen.getByRole('button', { name: 'Session done' }))

    expect(useAppStore.getState().debtCounter).toBe(0)
    expect(useAppStore.getState().sessionCount).toBe(1)
    expect(screen.getByText('PHASE 1 · UNIT 1.1 · STEP 1')).toBeInTheDocument()
  })

  it('explains a forced advance instead of leaving it unexplained', () => {
    useAppStore.setState({ forcedAdvance: true })
    renderToday()

    expect(screen.getByRole('status')).toHaveTextContent(/ran its full length/)
  })
})
