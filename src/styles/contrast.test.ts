/**
 * WCAG AA contrast for every color pairing actually used in src/styles/global.css.
 * The palette below must be kept in sync with global.css by hand — there's no CSS
 * parser here — but that's a deliberate trade-off: a plain, readable regression test
 * that fails loudly if a future token edit reintroduces a contrast failure, rather
 * than relying on a one-time manual audit that nobody re-runs.
 */
import { describe, expect, it } from 'vitest'

const LIGHT = {
  bg: '#faf8f5',
  surface: '#ffffff',
  surfaceSunken: '#f2efea',
  text: '#1b1917',
  textMuted: '#6c655c',
  textFaint: '#6f685e',
  border: '#e4dfd7',
  borderStrong: '#8a8175',
  accent: '#2f6ba8',
  accentOn: '#ffffff',
  accentSoft: '#e8f0f8',
  success: '#3f7d4e',
  danger: '#ad3a26',
}

const DARK = {
  bg: '#131416',
  surface: '#1b1d20',
  surfaceSunken: '#101112',
  text: '#ecebe8',
  textMuted: '#9a968f',
  textFaint: '#928e87',
  border: '#2b2e32',
  borderStrong: '#6b7079',
  accent: '#7fb0e6',
  accentOn: '#10171f',
  accentSoft: '#1d2a38',
  success: '#6aa87a',
  danger: '#e17a63',
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const [rl, gl, bl] = [r, g, b].map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl
}

/** WCAG contrast ratio between two hex colors, always >= 1. */
function contrast(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hexToRgb(hex1))
  const l2 = relativeLuminance(hexToRgb(hex2))
  const [lighter, darker] = l1 > l2 ? [l1, l2] : [l2, l1]
  return (lighter + 0.05) / (darker + 0.05)
}

const NORMAL_TEXT_MIN = 4.5
const UI_COMPONENT_MIN = 3.0

describe.each([
  ['light', LIGHT],
  ['dark', DARK],
])('%s theme contrast', (_name, p) => {
  it('body text meets 4.5:1 against its backgrounds', () => {
    expect(contrast(p.text, p.bg)).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN)
    expect(contrast(p.textMuted, p.bg)).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN)
    expect(contrast(p.textMuted, p.surfaceSunken)).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN)
  })

  it('text-faint meets 4.5:1 — it labels real text (breadcrumbs, eyebrows), not just decoration', () => {
    expect(contrast(p.textFaint, p.bg)).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN)
    expect(contrast(p.textFaint, p.surface)).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN)
    expect(contrast(p.textFaint, p.surfaceSunken)).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN)
  })

  it('accent meets 4.5:1 as text and as button-label-on-fill', () => {
    expect(contrast(p.accent, p.bg)).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN)
    expect(contrast(p.accent, p.accentSoft)).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN)
    expect(contrast(p.accentOn, p.accent)).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN)
  })

  it('success and danger read clearly against the page background', () => {
    expect(contrast(p.success, p.bg)).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN)
    expect(contrast(p.danger, p.bg)).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN)
    expect(contrast(p.danger, p.surfaceSunken)).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN)
  })

  it('border-strong meets the 3:1 non-text minimum — it is the only boundary marking inputs, selects, and secondary buttons as interactive', () => {
    expect(contrast(p.borderStrong, p.surface)).toBeGreaterThanOrEqual(UI_COMPONENT_MIN)
    expect(contrast(p.borderStrong, p.surfaceSunken)).toBeGreaterThanOrEqual(UI_COMPONENT_MIN)
  })
})
