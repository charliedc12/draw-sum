import { z } from 'zod'
import type {
  Curriculum,
  GateStatement,
  Phase,
  Reference,
  SessionStage,
  SessionTemplate,
  Step,
  Unit,
} from './curriculum.ts'

const id = z.string().min(1)
const text = z.string().min(1)

export const subjectSchema = z.object({
  kind: z.enum(['fromLife', 'reference']),
  text,
})

export const gateStatementSchema: z.ZodType<GateStatement> = z.object({
  text,
  statementUnitIds: z.array(id),
})

export const phaseSchema: z.ZodType<Phase> = z.object({
  id,
  name: text,
  order: z.number().int().positive(),
  unitIds: z.array(id).min(1),
  maxWeeks: z.number().int().positive(),
  // Empty for a terminal, ongoing phase (Phase 6) — there is nothing beyond it to gate into.
  gateStatements: z.array(gateStatementSchema),
  // Empty for Phase 1 — see the type's own doc comment.
  errorTags: z.array(text),
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

export const sessionStageSchema: z.ZodType<SessionStage> = z.object({
  atMin: z.number().int().nonnegative(),
  instruction: text,
})

export const sessionTemplateSchema: z.ZodType<SessionTemplate> = z.object({
  phaseId: id,
  durationOption: z.union([z.literal(30), z.literal(45), z.literal(60)]),
  stages: z.array(sessionStageSchema).min(1),
})

export const curriculumSchema: z.ZodType<Curriculum> = z.object({
  version: z.number().int().positive(),
  phases: z.array(phaseSchema).min(1),
  units: z.array(unitSchema).min(1),
  steps: z.array(stepSchema).min(1),
  references: z.array(referenceSchema),
  sessionTemplates: z.array(sessionTemplateSchema),
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
    phase.gateStatements.forEach((statement, index) => {
      for (const unitId of statement.statementUnitIds) {
        const unit = unitsById.get(unitId)
        if (!unit) {
          issues.push({
            path: `phases/${phase.id}/gateStatements[${index}]/statementUnitIds`,
            message: `references missing unit "${unitId}"`,
          })
        } else if (unit.phaseId !== phase.id) {
          issues.push({
            path: `phases/${phase.id}/gateStatements[${index}]/statementUnitIds`,
            message: `unit "${unitId}" belongs to phase "${unit.phaseId}", not this gate's phase`,
          })
        }
      }
    })
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

  // The earliest phase gets no error tags — at that stage the user can't yet identify
  // their own errors, and asking would just teach guessing.
  const earliestOrder = Math.min(...curriculum.phases.map((p) => p.order))
  for (const phase of curriculum.phases) {
    if (phase.order === earliestOrder && phase.errorTags.length > 0) {
      issues.push({
        path: `phases/${phase.id}/errorTags`,
        message: 'the earliest phase must have no error tags',
      })
    }
  }

  const durationOptions = [30, 45, 60] as const
  const templatesByPhase = new Map<string, typeof curriculum.sessionTemplates>()
  for (const template of curriculum.sessionTemplates) {
    if (!curriculum.phases.some((p) => p.id === template.phaseId)) {
      issues.push({
        path: `sessionTemplates/${template.phaseId}/${template.durationOption}`,
        message: `references missing phase "${template.phaseId}"`,
      })
      continue
    }
    const list = templatesByPhase.get(template.phaseId) ?? []
    list.push(template)
    templatesByPhase.set(template.phaseId, list)

    // Stages ordered by atMin, and none reaching or exceeding the session's own length.
    for (let i = 0; i < template.stages.length; i++) {
      const stage = template.stages[i]
      if (stage.atMin >= template.durationOption) {
        issues.push({
          path: `sessionTemplates/${template.phaseId}/${template.durationOption}/stages[${i}]`,
          message: `atMin ${stage.atMin} is not before the session's own length (${template.durationOption} min)`,
        })
      }
      if (i > 0 && stage.atMin < template.stages[i - 1].atMin) {
        issues.push({
          path: `sessionTemplates/${template.phaseId}/${template.durationOption}/stages[${i}]`,
          message: 'stages are not ordered by atMin',
        })
      }
    }

    // Rule 1, non-negotiable per template: an early stop-and-check-the-masses stage.
    const halfway = template.durationOption / 2
    const hasMassCheck = template.stages.some(
      (stage) => stage.atMin < halfway && /stop/i.test(stage.instruction),
    )
    if (!hasMassCheck) {
      issues.push({
        path: `sessionTemplates/${template.phaseId}/${template.durationOption}`,
        message: 'missing a pre-halfway stage that stops to check the masses',
      })
    }
  }

  for (const phase of curriculum.phases) {
    const templates = templatesByPhase.get(phase.id) ?? []
    for (const durationOption of durationOptions) {
      if (!templates.some((t) => t.durationOption === durationOption)) {
        issues.push({
          path: `sessionTemplates/${phase.id}`,
          message: `missing the ${durationOption}-minute template`,
        })
      }
    }

    // Rule 2, from Phase 2 onward: at least one stage across the phase's templates
    // names a from-life subject rather than a photo. The exact Phase 3/60 example given
    // has no such stage itself, so this is checked across the phase's templates as a
    // set, not required in literally every individual template.
    if (phase.order >= 2) {
      const hasFromLifeStage = templates.some((t) =>
        t.stages.some((stage) => /from life/i.test(stage.instruction)),
      )
      if (!hasFromLifeStage) {
        issues.push({
          path: `sessionTemplates/${phase.id}`,
          message: 'no template for this phase has a from-life stage',
        })
      }
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
