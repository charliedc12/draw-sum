import { describe, expect, it } from 'vitest'
import { curriculum } from '../data/curriculum.ts'
import {
  createActiveSession,
  currentStageIndex,
  DURATION_OPTIONS,
  elapsedMinutes,
  elapsedMs,
  findSessionTemplate,
  formatElapsed,
  initialTimer,
  isTimerRunning,
  pauseTimer,
  pickSessionSubject,
  resumeTimer,
  startTimer,
  toggleStage,
} from './session.ts'

const T0 = new Date('2026-01-01T09:00:00.000Z')
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000)

describe('findSessionTemplate — all 18 phase/duration combinations', () => {
  for (const phase of curriculum.phases) {
    for (const duration of DURATION_OPTIONS) {
      it(`exists for ${phase.id} at ${duration} minutes`, () => {
        const template = findSessionTemplate(curriculum, phase.id, duration)
        expect(template).toBeDefined()
        expect(template?.stages.length).toBeGreaterThan(0)
      })
    }
  }

  it('returns undefined for a duration that was never generated', () => {
    // @ts-expect-error deliberately invalid duration
    expect(findSessionTemplate(curriculum, 'p1', 40)).toBeUndefined()
  })

  it('returns undefined for a phase with no templates at all', () => {
    expect(findSessionTemplate(curriculum, 'nope', 30)).toBeUndefined()
  })
})

describe('every template has a pre-halfway stop-and-check-the-masses stage', () => {
  for (const template of curriculum.sessionTemplates) {
    it(`${template.phaseId}/${template.durationOption}`, () => {
      const halfway = template.durationOption / 2
      const massCheck = template.stages.find(
        (stage) => stage.atMin < halfway && /stop/i.test(stage.instruction),
      )
      expect(massCheck).toBeDefined()
    })
  }
})

describe('the exact Phase 3 / 60-minute template given in the spec', () => {
  it('matches verbatim', () => {
    const template = findSessionTemplate(curriculum, 'p3', 60)
    expect(template?.stages).toEqual([
      { atMin: 0, instruction: 'Thumbnail — horizon line and vanishing points only' },
      { atMin: 3, instruction: 'Big masses. Stop. Are they right? Fix now, not later.' },
      { atMin: 12, instruction: 'Secondary structure — roof planes, window grids' },
      { atMin: 35, instruction: 'Detail, focal area only' },
      { atMin: 50, instruction: 'Check your receding lines against the vanishing point' },
    ])
  })
})

describe('from Phase 2 onward, at least one template per phase has a from-life stage', () => {
  for (const phase of curriculum.phases.filter((p) => p.order >= 2)) {
    it(phase.id, () => {
      const templates = curriculum.sessionTemplates.filter((t) => t.phaseId === phase.id)
      const hasFromLife = templates.some((t) =>
        t.stages.some((stage) => /from life/i.test(stage.instruction)),
      )
      expect(hasFromLife).toBe(true)
    })
  }

  it('Phase 1 is not required to have one, and does not', () => {
    const templates = curriculum.sessionTemplates.filter((t) => t.phaseId === 'p1')
    const hasFromLife = templates.some((t) =>
      t.stages.some((stage) => /from life/i.test(stage.instruction)),
    )
    expect(hasFromLife).toBe(false)
  })
})

describe('currentStageIndex', () => {
  const template = findSessionTemplate(curriculum, 'p3', 60)!

  it('is the first stage before any boundary is crossed', () => {
    expect(currentStageIndex(template, 0)).toBe(0)
    expect(currentStageIndex(template, 2.9)).toBe(0)
  })

  it('advances exactly at each atMin boundary', () => {
    expect(currentStageIndex(template, 3)).toBe(1)
    expect(currentStageIndex(template, 11.9)).toBe(1)
    expect(currentStageIndex(template, 12)).toBe(2)
  })

  it('stays on the last stage past the end of the template', () => {
    expect(currentStageIndex(template, 999)).toBe(4)
  })
})

describe('pickSessionSubject', () => {
  it('picks from the phase reference pool and reports its fromLife kind', () => {
    const subject = pickSessionSubject(curriculum, 'p1', () => 0)
    expect(subject).toBeDefined()
    expect(subject?.text.length).toBeGreaterThan(0)
    expect(['fromLife', 'reference']).toContain(subject?.kind)
  })

  it('is undefined for a phase with no references', () => {
    expect(pickSessionSubject(curriculum, 'nope')).toBeUndefined()
  })

  it('respects the injected random source deterministically', () => {
    const first = pickSessionSubject(curriculum, 'p2', () => 0)
    const last = pickSessionSubject(curriculum, 'p2', () => 0.999999)
    expect(first).not.toEqual(last)
  })
})

describe('createActiveSession', () => {
  it('bundles a template-backed session with an untouched checklist and timer', () => {
    const active = createActiveSession(curriculum, 'p3', 60, () => 0)
    expect(active).toBeDefined()
    expect(active?.phaseId).toBe('p3')
    expect(active?.durationOption).toBe(60)
    expect(active?.checkedStageIndices).toEqual([])
    expect(active?.timer).toEqual(initialTimer())
  })

  it('is undefined for a phase/duration with no template', () => {
    expect(createActiveSession(curriculum, 'nope', 30)).toBeUndefined()
  })
})

describe('toggleStage', () => {
  const base = createActiveSession(curriculum, 'p1', 30, () => 0)!

  it('checks and unchecks independently, keeping indices sorted', () => {
    let session = toggleStage(base, 2)
    session = toggleStage(session, 0)
    expect(session.checkedStageIndices).toEqual([0, 2])
    session = toggleStage(session, 2)
    expect(session.checkedStageIndices).toEqual([0])
  })
})

describe('the wall-clock timer survives a simulated backgrounding gap', () => {
  it('reports zero before starting', () => {
    expect(elapsedMs(initialTimer(), T0)).toBe(0)
  })

  it('accumulates from the stored start timestamp alone, not from any tick count', () => {
    const timer = startTimer(T0)
    // Simulate the tab being backgrounded (and its interval suspended) for 25 minutes,
    // then asked for elapsed time the instant it's foregrounded again.
    const backgroundedUntil = at(25)
    expect(elapsedMinutes(timer, backgroundedUntil)).toBeCloseTo(25, 5)
  })

  it('freezes elapsed time while paused, across an arbitrarily long gap', () => {
    let timer = startTimer(T0)
    timer = pauseTimer(timer, at(10))
    const elapsedWhenPaused = elapsedMs(timer, at(10))
    // Even if the app is reopened days later while still paused, elapsed stays put.
    expect(elapsedMs(timer, at(10 + 60 * 24 * 3))).toBe(elapsedWhenPaused)
  })

  it('resumes counting from where it left off, excluding the paused interval', () => {
    let timer = startTimer(T0)
    timer = pauseTimer(timer, at(10))
    timer = resumeTimer(timer, at(40)) // paused for 30 minutes
    expect(elapsedMinutes(timer, at(45))).toBeCloseTo(15, 5) // 10 running + 5 more
  })

  it('handles two separate pause/resume cycles correctly', () => {
    let timer = startTimer(T0)
    timer = pauseTimer(timer, at(5))
    timer = resumeTimer(timer, at(10)) // +5 paused
    timer = pauseTimer(timer, at(20))
    timer = resumeTimer(timer, at(25)) // +5 paused
    expect(elapsedMinutes(timer, at(30))).toBeCloseTo(20, 5) // 30 - 10 paused
  })

  it('pausing twice in a row is a no-op the second time', () => {
    let timer = startTimer(T0)
    timer = pauseTimer(timer, at(5))
    const again = pauseTimer(timer, at(50))
    expect(again).toEqual(timer)
  })

  it('resuming a timer that was never paused is a no-op', () => {
    const timer = startTimer(T0)
    expect(resumeTimer(timer, at(5))).toEqual(timer)
  })

  it('isTimerRunning is true only after start and while not paused', () => {
    expect(isTimerRunning(initialTimer())).toBe(false)
    let timer = startTimer(T0)
    expect(isTimerRunning(timer)).toBe(true)
    timer = pauseTimer(timer, at(1))
    expect(isTimerRunning(timer)).toBe(false)
    timer = resumeTimer(timer, at(2))
    expect(isTimerRunning(timer)).toBe(true)
  })
})

describe('formatElapsed', () => {
  it('renders minutes and seconds under an hour', () => {
    expect(formatElapsed(0)).toBe('0:00')
    expect(formatElapsed(65_000)).toBe('1:05')
    expect(formatElapsed(59 * 60_000 + 59_000)).toBe('59:59')
  })

  it('renders hours once elapsed reaches sixty minutes', () => {
    expect(formatElapsed(60 * 60_000)).toBe('1:00:00')
    expect(formatElapsed(60 * 60_000 + 2 * 60_000 + 4_000)).toBe('1:02:04')
  })
})
