import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { curriculum } from '../data/curriculum.ts'
import * as progression from '../logic/progression.ts'
import type { ProgressState } from '../logic/progression.ts'

export type { LogEntry, ProgressState } from '../logic/progression.ts'

/* There is no streak field here, and no punitive state of any kind. Nothing in this
   store decays, expires, or gets taken away for not showing up. */

export type AppActions = {
  markStepDone: (stepId: string) => void
  markStepSkipped: (stepId: string) => void
  completeSession: () => void
  tickGate: (phaseId: string, index: number, value: boolean) => void
  advancePhase: () => void
  /** Manual override, either direction. Leaves all progress counts intact. */
  setPhase: (phaseId: string) => void
  /** Fills in anything a fresh or partial save is missing, then applies the clock cap. */
  hydrate: () => void
  /** Dismiss the "your phase advanced on the clock" explanation. */
  acknowledgeForcedAdvance: () => void
}

export type AppState = ProgressState & AppActions

export const STORAGE_KEY = 'drawpath-v1'

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...progression.initialProgress(curriculum),

      markStepDone: (stepId) =>
        set((state) => progression.markStepDone(state, curriculum, stepId)),

      markStepSkipped: (stepId) =>
        set((state) => progression.markStepSkipped(state, curriculum, stepId)),

      completeSession: () =>
        set((state) => progression.completeSession(state, curriculum)),

      tickGate: (phaseId, index, value) =>
        set((state) => progression.tickGate(state, curriculum, phaseId, index, value)),

      advancePhase: () => set((state) => progression.advancePhase(state, curriculum)),

      setPhase: (phaseId) =>
        set((state) => progression.setPhase(state, curriculum, phaseId)),

      hydrate: () => {
        const defaults = progression.initialProgress(curriculum)
        const repaired: ProgressState = {
          ...defaults,
          ...stripUndefined(pickProgress(get())),
        }
        if (!progression.findPhase(curriculum, repaired.currentPhaseId)) {
          repaired.currentPhaseId = defaults.currentPhaseId
          repaired.currentUnitId = defaults.currentUnitId
        }
        set(progression.applyForcedAdvance(repaired, curriculum))
      },

      acknowledgeForcedAdvance: () => set({ forcedAdvance: false }),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      partialize: (state) => pickProgress(state),
    },
  ),
)

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as Partial<T>
}

/** Only the data is persisted; the actions are rebuilt on every load. */
function pickProgress(state: AppState): ProgressState {
  return {
    currentPhaseId: state.currentPhaseId,
    phaseEntryDate: state.phaseEntryDate,
    currentUnitId: state.currentUnitId,
    unitRepCounts: state.unitRepCounts,
    stepCompletionCounts: state.stepCompletionCounts,
    stepSkipCounts: state.stepSkipCounts,
    drillCount: state.drillCount,
    sessionCount: state.sessionCount,
    debtCounter: state.debtCounter,
    gateTicks: state.gateTicks,
    log: state.log,
    forcedAdvance: state.forcedAdvance,
  }
}
