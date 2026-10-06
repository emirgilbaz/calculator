import { describe, expect, it } from 'vitest'
import { formatNumber } from './format.ts'

describe('formatNumber', () => {
  it.each([
    // Everyday numbers
    { value: 5, expected: '5', why: 'integers stay plain' },
    { value: -42.5, expected: '-42.5', why: 'negative decimals stay plain' },
    { value: 123456.789, expected: '123456.789', why: 'meaningful decimals are kept' },

    // Floating-point noise
    { value: 0.1 + 0.2, expected: '0.3', why: 'hides IEEE-754 rounding noise' },
    { value: 1.1 * 3, expected: '3.3', why: 'hides noise from multiplication' },
    { value: 1 / 3, expected: '0.333333333333', why: 'rounds to 12 significant digits' },

    // Boundaries of plain notation
    { value: 999_999_999_999, expected: '999999999999', why: 'largest plain number' },
    { value: 1e12, expected: '1e+12', why: 'first exponential number' },
    { value: 0.000001, expected: '0.000001', why: 'smallest plain number' },
    { value: 0.000000999, expected: '9.99e-7', why: 'just below the plain range' },

    // Exponential notation
    { value: 2 ** 40, expected: '1.09951162778e+12', why: 'large numbers use exponential' },
    { value: -1e15, expected: '-1e+15', why: 'negative large numbers too' },
    { value: 1e-7, expected: '1e-7', why: 'tiny numbers use exponential' },
    { value: 999_999_999_999.9, expected: '1e+12', why: 'rounding up crosses into exponential' },

    // Zero
    { value: 0, expected: '0', why: 'zero' },
    { value: -0, expected: '0', why: 'negative zero is shown as 0' },

    // Defensive: the backend never returns these, but formatting must not throw
    { value: Number.NaN, expected: 'NaN', why: 'NaN is shown as text' },
    { value: Infinity, expected: 'Infinity', why: 'Infinity is shown as text' },
  ])('$why: $value → $expected', ({ value, expected }) => {
    expect(formatNumber(value)).toBe(expected)
  })
})