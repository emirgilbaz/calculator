/**
 * Display formatting for numbers returned by the API.
 *
 * The backend returns exact IEEE-754 results (0.1 + 0.2 = 0.30000000000000004).
 * Rounding happens here, for display only; calculations always use the exact value.
 */

/** Significant digits shown: plenty for real use, few enough to hide float noise. */
const SIGNIFICANT_DIGITS = 12

/** Magnitudes outside [MIN_PLAIN, MAX_PLAIN) are shown in exponential notation. */
const MAX_PLAIN = 1e12
const MIN_PLAIN = 1e-6

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value)
  if (value === 0) return '0' // also turns -0 into "0"

  const rounded = Number(value.toPrecision(SIGNIFICANT_DIGITS))
  const magnitude = Math.abs(rounded)

  if (magnitude >= MAX_PLAIN || magnitude < MIN_PLAIN) {
    return rounded.toExponential()
  }
  return String(rounded)
}