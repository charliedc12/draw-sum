import raw from './curriculum.json'
import { parseCurriculum } from '../types/schemas.ts'

/* Parsed once at module load. If the JSON is ever malformed the app fails here, loudly,
   instead of rendering a half-empty screen. `npm run validate:curriculum` catches it
   first. */
export const curriculum = parseCurriculum(raw)
