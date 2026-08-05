/* Run with `npm run validate:curriculum`.
   Fails loudly: schema errors, dangling unit/step IDs, and units whose requiredReps
   can't cover their own steps. */
import curriculum from '../src/data/curriculum.json' with { type: 'json' }
import { checkCurriculumIntegrity, curriculumSchema } from '../src/types/schemas.ts'

function fail(heading: string, lines: string[]): never {
  console.error(`\n✗ ${heading}\n`)
  for (const line of lines) console.error(`  ${line}`)
  console.error('')
  process.exit(1)
}

const parsed = curriculumSchema.safeParse(curriculum)
if (!parsed.success) {
  fail(
    'curriculum.json failed schema validation',
    parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
  )
}

const issues = checkCurriculumIntegrity(parsed.data)
if (issues.length > 0) {
  fail(
    `curriculum.json has ${issues.length} integrity problem${issues.length === 1 ? '' : 's'}`,
    issues.map((i) => `${i.path}: ${i.message}`),
  )
}

const { phases, units, steps, references } = parsed.data
const dailyUnits = units.filter((u) => u.kind === 'daily')

console.log('✓ curriculum.json is valid')
console.log(
  `  ${phases.length} phases · ${units.length} units (${dailyUnits.length} daily, ` +
    `${units.length - dailyUnits.length} weekend) · ${steps.length} steps · ` +
    `${references.length} references`,
)
for (const phase of phases) {
  const phaseUnits = phase.unitIds.map((id) => units.find((u) => u.id === id)!)
  const stepCount = phaseUnits.reduce((n, u) => n + u.stepIds.length, 0)
  console.log(
    `  ${phase.id} ${phase.name}: ${phaseUnits.length} units, ${stepCount} steps, ` +
      `maxWeeks ${phase.maxWeeks}, ${phase.gateStatements.length} gate statements`,
  )
}
