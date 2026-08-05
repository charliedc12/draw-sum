import { z } from 'zod'
import type { Curriculum, Phase, Reference, Step, Unit } from './curriculum.ts'

const id = z.string().min(1)
const text = z.string().min(1)

export const subjectSchema = z.object({
  kind: z.enum(['fromLife', 'reference']),
  text,
})

export const phaseSchema: z.ZodType<Phase> = z.object({
  id,
  name: text,
  order: z.number().int().positive(),
  unitIds: z.array(id).min(1),
  maxWeeks: z.number().int().positive(),
  gateStatements: z.array(text).min(1),
})

export const unitSchema: z.ZodType<Unit> = z.object({
  id,
  phaseId: id,
  name: text,
  kind: z.enum(['daily', 'weekend']),
  stepIds: z.array(id).min(1),
  requiredReps: z.number().int().positive(),
})

export const stepSchema: z.ZodType<Step> = z.object({
  id,
  unitId: id,
  name: text,
  durationMin: z.number().int().positive(),
  materials: text,
  instructions: z.array(text).min(1),
  commonFailure: text.optional(),
  subject: subjectSchema,
  alternateStepId: id.optional(),
})

export const referenceSchema: z.ZodType<Reference> = z.object({
  id,
  phaseId: id,
  category: z.enum(['subject', 'fromLifePrompt']),
  subject: text,
  fromLife: z.boolean(),
})

export const curriculumSchema: z.ZodType<Curriculum> = z.object({
  version: z.number().int().positive(),
  phases: z.array(phaseSchema).min(1),
  units: z.array(unitSchema).min(1),
  steps: z.array(stepSchema).min(1),
  references: z.array(referenceSchema),
})

export type CurriculumIssue = {
  path: string
  message: string
}

/* Referential checks Zod can't express on its own: every ID a phase or unit points at
   must resolve, and a unit must ask for at least one rep per step or it can never
   cycle. Kept separate from the schema so the validator and the app share it. */
export function checkCurriculumIntegrity(curriculum: Curriculum): CurriculumIssue[] {
  const issues: CurriculumIssue[] = []
  const unitsById = new Map(curriculum.units.map((u) => [u.id, u]))
  const stepsById = new Map(curriculum.steps.map((s) => [s.id, s]))

  for (const [kind, items] of [
    ['phases', curriculum.phases],
    ['units', curriculum.units],
    ['steps', curriculum.steps],
    ['references', curriculum.references],
  ] as const) {
    const seen = new Set<string>()
    for (const item of items) {
      if (seen.has(item.id)) {
        issues.push({ path: `${kind}/${item.id}`, message: `duplicate id "${item.id}"` })
      }
      seen.add(item.id)
    }
  }

  for (const phase of curriculum.phases) {
    for (const unitId of phase.unitIds) {
      if (!unitsById.has(unitId)) {
        issues.push({
          path: `phases/${phase.id}/unitIds`,
          message: `references missing unit "${unitId}"`,
        })
      }
    }
  }

  for (const unit of curriculum.units) {
    if (!curriculum.phases.some((p) => p.id === unit.phaseId)) {
      issues.push({
        path: `units/${unit.id}/phaseId`,
        message: `references missing phase "${unit.phaseId}"`,
      })
    }
    for (const stepId of unit.stepIds) {
      if (!stepsById.has(stepId)) {
        issues.push({
          path: `units/${unit.id}/stepIds`,
          message: `references missing step "${stepId}"`,
        })
      }
    }
    if (unit.requiredReps < unit.stepIds.length) {
      issues.push({
        path: `units/${unit.id}/requiredReps`,
        message: `requiredReps ${unit.requiredReps} is lower than its ${unit.stepIds.length} steps`,
      })
    }
  }

  for (const step of curriculum.steps) {
    if (!unitsById.has(step.unitId)) {
      issues.push({
        path: `steps/${step.id}/unitId`,
        message: `references missing unit "${step.unitId}"`,
      })
    }
    if (step.alternateStepId && !stepsById.has(step.alternateStepId)) {
      issues.push({
        path: `steps/${step.id}/alternateStepId`,
        message: `references missing step "${step.alternateStepId}"`,
      })
    }
  }

  return issues
}

/** Parses and integrity-checks in one go. Throws with every problem listed. */
export function parseCurriculum(data: unknown): Curriculum {
  const curriculum = curriculumSchema.parse(data)
  const issues = checkCurriculumIntegrity(curriculum)
  if (issues.length > 0) {
    throw new Error(
      `Curriculum integrity failed:\n${issues
        .map((i) => `  ${i.path}: ${i.message}`)
        .join('\n')}`,
    )
  }
  return curriculum
}
