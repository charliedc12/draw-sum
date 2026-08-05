import { beforeEach, describe, expect, it } from 'vitest'
import { curriculum } from '../data/curriculum.ts'
import { initialProgress } from '../logic/progression.ts'
import { useAppStore } from './useAppStore.ts'

beforeEach(() => {
  useAppStore.setState(initialProgress(curriculum))
})

describe('forced-advance notice — shown exactly once per phase', () => {
  it('hydrate() sets forcedAdvance once the phase goes overdue', () => {
    const overdueDate = new Date(Date.now() - 999 * 24 * 60 * 60 * 1000).toISOString()
    useAppStore.setState({ phaseEntryDate: overdueDate })

    useAppStore.getState().hydrate()

    expect(useAppStore.getState().forcedAdvance).toBe(true)
    expect(useAppStore.getState().currentPhaseId).toBe('p2')
  })

  it('stays visible across repeated hydrate() calls until dismissed', () => {
    const overdueDate = new Date(Date.now() - 999 * 24 * 60 * 60 * 1000).toISOString()
    useAppStore.setState({ phaseEntryDate: overdueDate })
    useAppStore.getState().hydrate()

    useAppStore.getState().hydrate()
    useAppStore.getState().hydrate()

    expect(useAppStore.getState().forcedAdvance).toBe(true)
  })

  it('never reappears on its own once dismissed, even after more hydrate() calls', () => {
    const overdueDate = new Date(Date.now() - 999 * 24 * 60 * 60 * 1000).toISOString()
    useAppStore.setState({ phaseEntryDate: overdueDate })
    useAppStore.getState().hydrate()
    expect(useAppStore.getState().forcedAdvance).toBe(true)

    useAppStore.getState().acknowledgeForcedAdvance()
    expect(useAppStore.getState().forcedAdvance).toBe(false)

    useAppStore.getState().hydrate()
    useAppStore.getState().hydrate()
    expect(useAppStore.getState().forcedAdvance).toBe(false)
  })

  it('can show again for a later phase’s own forced advance — a fresh event, not a repeat', () => {
    // Phase 1 forces into Phase 2 and gets dismissed.
    useAppStore.setState({
      phaseEntryDate: new Date(Date.now() - 999 * 24 * 60 * 60 * 1000).toISOString(),
    })
    useAppStore.getState().hydrate()
    useAppStore.getState().acknowledgeForcedAdvance()
    expect(useAppStore.getState().currentPhaseId).toBe('p2')

    // Time passes and Phase 2 itself goes overdue — a distinct event.
    useAppStore.setState({
      phaseEntryDate: new Date(Date.now() - 999 * 24 * 60 * 60 * 1000).toISOString(),
    })
    useAppStore.getState().hydrate()

    expect(useAppStore.getState().forcedAdvance).toBe(true)
    expect(useAppStore.getState().currentPhaseId).toBe('p3')
  })

  it('a normal (non-forced) phase change clears any pending notice', () => {
    useAppStore.setState({
      phaseEntryDate: new Date(Date.now() - 999 * 24 * 60 * 60 * 1000).toISOString(),
    })
    useAppStore.getState().hydrate()
    expect(useAppStore.getState().forcedAdvance).toBe(true)

    useAppStore.getState().setPhase('p1')
    expect(useAppStore.getState().forcedAdvance).toBe(false)
  })
})

describe('dev actions', () => {
  it('devCloseAllDailyUnits closes the current phase without touching drillCount', () => {
    useAppStore.getState().devCloseAllDailyUnits()
    const state = useAppStore.getState()
    expect(state.unitRepCounts['u1.1']).toBe(8)
    expect(state.unitRepCounts['u1.2']).toBe(6)
    expect(state.unitRepCounts['u1.3']).toBe(6)
    expect(state.drillCount).toBe(0)
  })

  it('devSetPhaseEntryDaysAgo backdates phaseEntryDate', () => {
    useAppStore.getState().devSetPhaseEntryDaysAgo(40)
    const state = useAppStore.getState()
    const days = Math.round((Date.now() - new Date(state.phaseEntryDate).getTime()) / 86_400_000)
    expect(days).toBe(40)
  })

  it('devResetAll wipes progress back to a first-run state', () => {
    useAppStore.setState({ drillCount: 99, currentPhaseId: 'p3' })
    useAppStore.getState().devResetAll()
    const state = useAppStore.getState()
    expect(state.drillCount).toBe(0)
    expect(state.currentPhaseId).toBe('p1')
  })
})
