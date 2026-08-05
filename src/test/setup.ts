import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

/* Node 26 defines a `localStorage` global that stays undefined unless the process was
   started with --localstorage-file, and it shadows the one jsdom provides. Zustand's
   persist middleware resolves its storage once, when the store module is imported, so
   the stand-in has to exist before any test file loads — module scope, not beforeEach. */
const entries = new Map<string, string>()

const memoryStorage: Storage = {
  get length() {
    return entries.size
  },
  clear: () => entries.clear(),
  getItem: (key) => entries.get(key) ?? null,
  key: (index) => [...entries.keys()][index] ?? null,
  removeItem: (key) => {
    entries.delete(key)
  },
  setItem: (key, value) => {
    entries.set(key, String(value))
  },
}

for (const target of [globalThis, window]) {
  Object.defineProperty(target, 'localStorage', {
    value: memoryStorage,
    configurable: true,
    writable: true,
  })
}

// Same object throughout, so zustand keeps its reference; only the contents reset.
beforeEach(() => {
  entries.clear()
})

afterEach(cleanup)
