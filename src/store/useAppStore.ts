import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { curriculum } from '../data/curriculum.ts'
import * as progression from '../logic/progression.ts'
import type { ProgressState } from '../logic/progression.ts'
import { migrateProgressState } from '../logic/migrations.ts'
import type { DueNotification } from '../logic/notifications.ts'
import type { DurationOption } from '../types/curriculum.ts'

export type { LogEntry, ProgressState } from '../logic/progression.ts'

/* There is no streak field here, and no punitive state of any kind. Nothing in this
   store decays, expires, or gets taken away for not showing up. */

export type AppActions = {
  markStepDone: (stepId: string) => void
  markStepSkipped: (stepId: string) => void
  /** The ninety-second floor. Counts toward drillCount only — no unit reps, no debt. */
  markMicroDrillDone: (microDrillId: string) => void
  completeSession: () => void
  /** Attaches error tags to the session just completed. A no-op if none are selected. */
  tagLastSession: (tags: string[]) => void
  /** Generates a staged session for the current phase at the given length. */
  beginSession: (durationOption: DurationOption) => void
  /** Discards an in-progress session without completing it. */
  discardActiveSession: () => void
  toggleActiveSessionStage: (index: number) => void
  startActiveSessionTimer: () => void
  pauseActiveSessionTimer: () => void
  resumeActiveSessionTimer: () => void
  tickGate: (phaseId: string, index: number, value: boolean) => void
  advancePhase: () => void
  /** Manual override, either direction. Leaves all progress counts intact. */
  setPhase: (phaseId: string) => void
  /** Starts (or restarts) a top-up on the current phase's unticked gate statements. */
  startTopUp: () => void
  /** Fills in anything a fresh or partial save is missing, then applies the clock cap. */
  hydrate: () => void
  /** Dismiss the "your phase advanced on the clock" explanation. */
  acknowledgeForcedAdvance: () => void
  /** Marks a rising-standards day-milestone shown and dismissed — never reappears. */
  dismissRisingStandardsCard: (day: number) => void
  /** Logs a redraw round complete. Nothing else — no image, no comparison, no result. */
  completeRedrawRound: (day: number) => void
  setDailyNotificationSlot: (
    index: 0 | 1,
    partial: Partial<{ hour: number; minute: number; enabled: boolean }>,
  ) => void
  setWeeklyNotificationSlot: (
    partial: Partial<{
      hour: number
      minute: number
      enabled: boolean
      weekday: number
      durationOption: DurationOption
    }>,
  ) => void
  recordNotificationFired: (due: DueNotification) => void
  /** The real, user-facing full reset (Settings). Wipes everything to a first-run state. */
  resetAll: () => void
  /** Dev-only: fills the current phase's daily units to their requiredReps. */
  devCloseAllDailyUnits: () => void
  /** Dev-only: backdates phaseEntryDate to exercise the forced-advance boundary. */
  devSetPhaseEntryDaysAgo: (days: number) => void
  /** Dev-only: wipes all progress back to a first-run state. */
  devResetAll: () => void
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

      markMicroDrillDone: (microDrillId) =>
        set((state) => progression.markMicroDrillDone(state, curriculum, microDrillId)),

      completeSession: () =>
        set((state) => progression.completeSession(state, curriculum)),

      tagLastSession: (tags) => set((state) => progression.tagLastSession(state, tags)),

      beginSession: (durationOption) =>
        set((state) => progression.beginSession(state, curriculum, durationOption)),

      discardActiveSession: () => set((state) => progression.discardActiveSession(state)),

      toggleActiveSessionStage: (index) =>
        set((state) => progression.toggleActiveSessionStage(state, index)),

      startActiveSessionTimer: () =>
        set((state) => progression.startActiveSessionTimer(state)),

      pauseActiveSessionTimer: () =>
        set((state) => progression.pauseActiveSessionTimer(state)),

      resumeActiveSessionTimer: () =>
        set((state) => progression.resumeActiveSessionTimer(state)),

      tickGate: (phaseId, index, value) =>
        set((state) => progression.tickGate(state, curriculum, phaseId, index, value)),

      advancePhase: () => set((state) => progression.advancePhase(state, curriculum)),

      setPhase: (phaseId) =>
        set((state) => progression.setPhase(state, curriculum, phaseId)),

      startTopUp: () => set((state) => progression.startTopUp(state, curriculum)),

      hydrate: () => {
        // ID migration runs on the raw saved data first — it only ever rewrites
        // unit/step/phase ID references, so it must see the actual old IDs before
        // the defaults merge below could paper over a missing curriculumVersion.
        const migrated = migrateProgressState(pickProgress(get()), curriculum)
        const defaults = progression.initialProgress(curriculum)
        const repaired: ProgressState = {
          ...defaults,
          ...stripUndefined(migrated),
        }
        if (!progression.findPhase(curriculum, repaired.currentPhaseId)) {
          repaired.currentPhaseId = defaults.currentPhaseId
          repaired.currentUnitId = defaults.currentUnitId
        }
        set(progression.applyForcedAdvance(repaired, curriculum))
      },

      acknowledgeForcedAdvance: () => set({ forcedAdvance: false }),

      dismissRisingStandardsCard: (day) =>
        set((state) => progression.dismissRisingStandardsCard(state, day)),

      completeRedrawRound: (day) =>
        set((state) => progression.completeRedrawRound(state, day)),

      setDailyNotificationSlot: (index, partial) =>
        set((state) => progression.setDailyNotificationSlot(state, index, partial)),

      setWeeklyNotificationSlot: (partial) =>
        set((state) => progression.setWeeklyNotificationSlot(state, partial)),

      recordNotificationFired: (due) =>
        set((state) => progression.recordNotificationFired(state, due)),

      resetAll: () => set(progression.initialProgress(curriculum)),

      devCloseAllDailyUnits: () =>
        set((state) => progression.closeAllDailyUnits(state, curriculum)),

      devSetPhaseEntryDaysAgo: (days) =>
        set((state) => progression.setPhaseEntryDaysAgo(state, days)),

      devResetAll: () => set(progression.initialProgress(curriculum)),
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
    topUp: state.topUp,
    activeSession: state.activeSession,
    firstUseDate: state.firstUseDate,
    risingStandardsShown: state.risingStandardsShown,
    redrawRoundsCompleted: state.redrawRoundsCompleted,
    notificationSettings: state.notificationSettings,
    curriculumVersion: state.curriculumVersion,
  }
}
