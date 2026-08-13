/* Curriculum versioning. Revising curriculum.json — renaming or restructuring a step
   or unit — must never orphan saved progress, which references IDs by plain string
   (unitRepCounts, stepCompletionCounts, stepSkipCounts, currentUnitId, log[].targetId,
   gateTicks, topUp.phaseId, activeSession.phaseId). CLAUDE.md's rule is "deprecate an
   ID, never delete it" — this file is the other half of that promise: when an ID
   *does* need to change, a migration entry carries every existing save forward to the
   new name instead of silently losing the history attached to the old one.

   No entries exist in CURRICULUM_MIGRATIONS yet because curriculum.json hasn't needed
   one — nothing has been renamed since the first version shipped. The mechanism is
   proven by src/logic/migrations.test.ts, which builds its own v1 → v2 scenario. */

import type { Curriculum } from '../types/curriculum.ts'
import type { LogEntry, ProgressState } from './progression.ts'

export type IdMigration = {
  fromVersion: number
  toVersion: number
  /** Old phase ID -> new phase ID. */
  phaseIdMap?: Record<string, string>
  /** Old unit ID -> new unit ID. */
  unitIdMap?: Record<string, string>
  /** Old step ID -> new step ID. */
  stepIdMap?: Record<string, string>
}

/** Real migrations for the shipped curriculum. Empty until an ID actually changes. */
export const CURRICULUM_MIGRATIONS: IdMigration[] = []

function remapKey(map: Record<string, string> | undefined, key: string): string {
  return map?.[key] ?? key
}

function remapRecord(
  map: Record<string, string> | undefined,
  record: Record<string, number>,
): Record<string, number> {
  if (!map) return record
  const remapped: Record<string, number> = {}
  for (const [key, value] of Object.entries(record)) {
    remapped[remapKey(map, key)] = value
  }
  return remapped
}

function remapLogEntry(migration: IdMigration, entry: LogEntry): LogEntry {
  if (entry.targetKind === 'step') {
    return { ...entry, targetId: remapKey(migration.stepIdMap, entry.targetId) }
  }
  if (entry.targetKind === 'session') {
    // A session's targetId is the phase's weekend unit ID (or, lacking one, the
    // phase ID itself) — see completeSession in progression.ts.
    const viaUnit = remapKey(migration.unitIdMap, entry.targetId)
    const viaPhase = remapKey(migration.phaseIdMap, entry.targetId)
    return { ...entry, targetId: viaUnit !== entry.targetId ? viaUnit : viaPhase }
  }
  // microDrill IDs live in their own namespace, untouched by unit/step/phase migrations.
  return entry
}

function applyOne(state: ProgressState, migration: IdMigration): ProgressState {
  const { phaseIdMap, unitIdMap, stepIdMap } = migration

  return {
    ...state,
    currentPhaseId: remapKey(phaseIdMap, state.currentPhaseId),
    currentUnitId: remapKey(unitIdMap, state.currentUnitId),
    unitRepCounts: remapRecord(unitIdMap, state.unitRepCounts),
    stepCompletionCounts: remapRecord(stepIdMap, state.stepCompletionCounts),
    stepSkipCounts: remapRecord(stepIdMap, state.stepSkipCounts),
    gateTicks: phaseIdMap
      ? Object.fromEntries(
          Object.entries(state.gateTicks).map(([phaseId, ticks]) => [
            remapKey(phaseIdMap, phaseId),
            ticks,
          ]),
        )
      : state.gateTicks,
    log: state.log.map((entry) => remapLogEntry(migration, entry)),
    topUp: state.topUp
      ? { ...state.topUp, phaseId: remapKey(phaseIdMap, state.topUp.phaseId) }
      : state.topUp,
    activeSession: state.activeSession
      ? { ...state.activeSession, phaseId: remapKey(phaseIdMap, state.activeSession.phaseId) }
      : state.activeSession,
    // A pending Done/Skip undo snapshot references old IDs by name and isn't remapped
    // above — safest to just drop it rather than let it restore under a renamed ID.
    lastUndo: null,
  }
}

/**
 * Carries a saved state forward to the curriculum's current version, applying every
 * migration in between in order. A state with no recorded version is treated as the
 * very first shipped version (1) — the field didn't always exist. A no-op, returning
 * `state` unchanged, once already current.
 */
export function migrateProgressState(
  state: ProgressState & { curriculumVersion?: number },
  targetCurriculum: Curriculum,
  migrations: IdMigration[] = CURRICULUM_MIGRATIONS,
): ProgressState & { curriculumVersion: number } {
  const startVersion = state.curriculumVersion ?? 1
  const applicable = migrations
    .filter((m) => m.fromVersion >= startVersion && m.toVersion <= targetCurriculum.version)
    .sort((a, b) => a.fromVersion - b.fromVersion)

  let migrated: ProgressState = state
  for (const migration of applicable) {
    migrated = applyOne(migrated, migration)
  }

  return { ...migrated, curriculumVersion: targetCurriculum.version }
}
