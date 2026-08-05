import { describe, expect, it } from 'vitest'
import rawCurriculum from '../data/curriculum.json'
import { checkCurriculumIntegrity, curriculumSchema, parseCurriculum } from './schemas.ts'
import type { Curriculum } from './curriculum.ts'

const valid = curriculumSchema.parse(rawCurriculum)

function mutate(change: (draft: Curriculum) => void): Curriculum {
  const draft = structuredClone(valid)
  change(draft)
  return draft
}

describe('curriculum.json', () => {
  it('parses and passes every integrity check', () => {
    expect(checkCurriculumIntegrity(valid)).toEqual([])
  })

  it('carries both phases in full', () => {
    expect(valid.phases.map((p) => p.id)).toEqual(['p1', 'p2'])
    expect(valid.units).toHaveLength(8)
    expect(valid.steps).toHaveLength(23)
  })

  it('keeps the exact durations and failure lines from the source doc', () => {
    const step = valid.steps.find((s) => s.id === 's2.1.2')!
    expect(step.durationMin).toBe(7)
    expect(step.commonFailure).toBe(
      'You will flatten the extremes. Steep angles get drawn shallower than they are.',
    )
  })
})

describe('validation failures', () => {
  it('rejects a schema violation', () => {
    const broken = mutate((draft) => {
      // @ts-expect-error deliberately wrong type
      draft.steps[0].durationMin = 'six'
    })
    expect(() => parseCurriculum(broken)).toThrow()
  })

  it('catches a unit referencing a missing step ID', () => {
    const broken = mutate((draft) => {
      draft.units[0].stepIds.push('s-nope')
    })
    expect(checkCurriculumIntegrity(broken)).toContainEqual(
      expect.objectContaining({ message: 'references missing step "s-nope"' }),
    )
    expect(() => parseCurriculum(broken)).toThrow(/references missing step/)
  })

  it('catches a phase referencing a missing unit ID', () => {
    const broken = mutate((draft) => {
      draft.phases[0].unitIds.push('u-nope')
    })
    expect(() => parseCurriculum(broken)).toThrow(/references missing unit "u-nope"/)
  })

  it('catches a unit whose requiredReps is below its step count', () => {
    const broken = mutate((draft) => {
      draft.units[0].requiredReps = 1
    })
    expect(() => parseCurriculum(broken)).toThrow(/lower than its 4 steps/)
  })

  it('catches a duplicate ID', () => {
    const broken = mutate((draft) => {
      draft.steps.push({ ...draft.steps[0] })
    })
    expect(() => parseCurriculum(broken)).toThrow(/duplicate id/)
  })

  it('catches a dangling alternateStepId', () => {
    const broken = mutate((draft) => {
      draft.steps[0].alternateStepId = 's-nope'
    })
    expect(() => parseCurriculum(broken)).toThrow(/alternateStepId/)
  })
})
