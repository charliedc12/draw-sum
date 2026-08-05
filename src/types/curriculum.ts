/* Shape of src/data/curriculum.json. See CLAUDE.md — the curriculum is data, and
   these IDs are permanent because saved progress references them. */

export type UnitKind = 'daily' | 'weekend'

export type SubjectKind = 'fromLife' | 'reference'

export type Subject = {
  kind: SubjectKind
  /** What the person actually draws. Specificity is the product — never generalise. */
  text: string
}

export type GateStatement = {
  text: string
  /**
   * Which units feed this statement. Used to assemble a targeted top-up when the
   * statement is left unticked at the gate — see [[startTopUp]] in progression.ts.
   */
  statementUnitIds: string[]
}

export type Phase = {
  id: string
  name: string
  order: number
  unitIds: string[]
  /** After this many weeks the phase advances whether or not the gate was ticked. */
  maxWeeks: number
  gateStatements: GateStatement[]
  /**
   * Options offered after a weekend session, multi-select and entirely optional.
   * Empty for Phase 1 — at that stage the user can't yet identify their own errors, and
   * asking would just teach guessing.
   */
  errorTags: string[]
}

export type Unit = {
  id: string
  phaseId: string
  name: string
  kind: UnitKind
  stepIds: string[]
  /** Total step completions that close the unit. Always >= stepIds.length. */
  requiredReps: number
}

export type Step = {
  id: string
  unitId: string
  name: string
  durationMin: number
  materials: string
  instructions: string[]
  commonFailure?: string
  subject: Subject
  /** Offered as a swap after the step has been skipped three times. */
  alternateStepId?: string
}

export type Reference = {
  id: string
  phaseId: string
  /** Which list in docs/CURRICULUM.md this came from. */
  category: 'subject' | 'fromLifePrompt'
  subject: string
  /** True when the prompt only works in front of the real thing. */
  fromLife: boolean
}

export type DurationOption = 30 | 45 | 60

export type SessionStage = {
  /** Minutes into the session this stage begins. Always < the template's durationOption. */
  atMin: number
  instruction: string
}

export type SessionTemplate = {
  phaseId: string
  durationOption: DurationOption
  /**
   * Ordered by atMin. Every template must have a stage before the halfway mark whose
   * instruction stops the user to check the big masses — see CLAUDE.md. From Phase 2
   * onward, at least one of a phase's templates must also carry a from-life stage.
   */
  stages: SessionStage[]
}

/**
 * A drill that fits inside the ninety-second floor: not tied to any unit, doesn't
 * count toward unit reps. For when there's real time but not enough for a normal
 * drill — a five-minute drill actually done beats a forty-five-minute session planned
 * and skipped.
 */
export type MicroDrill = {
  id: string
  name: string
  durationMin: number
  materials: string
  instructions: string[]
}

/**
 * One of the six locked redraw subjects. Never served by the ordinary reference or
 * from-life pools — the whole point is that they stay fixed across every round so the
 * four attempts of each are comparable. See docs/CURRICULUM.md.
 */
export type RedrawSubject = {
  id: string
  text: string
}

export type Curriculum = {
  version: number
  phases: Phase[]
  units: Unit[]
  steps: Step[]
  references: Reference[]
  sessionTemplates: SessionTemplate[]
  microDrills: MicroDrill[]
  redrawSubjects: RedrawSubject[]
}
