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

export type Curriculum = {
  version: number
  phases: Phase[]
  units: Unit[]
  steps: Step[]
  references: Reference[]
}
