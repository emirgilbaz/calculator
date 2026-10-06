// Runs before every test file.
import * as matchers from '@testing-library/jest-dom/matchers'
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers'
import { cleanup } from '@testing-library/react'
import { afterEach, expect } from 'vitest'

// DOM matchers such as toBeInTheDocument() and toHaveTextContent().
expect.extend(matchers)

// Teach TypeScript about them. Vitest 5 changed its Assertion type, so
// jest-dom's bundled Vitest typings don't fit; Matchers is Vitest's own
// extension point for custom matchers.
declare module 'vitest' {
  interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown>
    extends TestingLibraryMatchers<T, R> {}
}

// Unmount everything rendered by a test, so tests never affect each other.
afterEach(() => {
  cleanup()
})