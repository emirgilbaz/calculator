import { ARITY, type Operation } from '../api/types.ts'
import type { Calculation } from '../lib/calculatorReducer.ts'
import { formatNumber } from '../lib/format.ts'

/** How each operation is written on the paper tape. */
const SYMBOLS: Record<Operation, string> = {
  add: '+',
  subtract: '−',
  multiply: '×',
  divide: '÷',
  power: '^',
  sqrt: '√',
  percentage: '% of',
}

interface DisplayProps {
  value: string
  pending: { left: number; operation: Operation } | null
  lastCalculation: Calculation | null
  errorMessage: string | null
}

export function Display({ value, pending, lastCalculation, errorMessage }: DisplayProps) {
  return (
    <div className="display">
      <p className="display__tape" data-testid="tape">
        {tapeText(pending, lastCalculation)}
      </p>
      <output className="display__value" data-size={sizeFor(value)} aria-live="polite">
        {value}
      </output>
      <p className="display__error" role="alert">
        {errorMessage}
      </p>
    </div>
  )
}

/** The calculation in progress ("12 +") or the one just completed ("12 + 3 ="). */
function tapeText(
  pending: DisplayProps['pending'],
  lastCalculation: DisplayProps['lastCalculation'],
): string {
  if (pending) return `${formatNumber(pending.left)} ${SYMBOLS[pending.operation]}`
  if (lastCalculation) return `${formatCalculation(lastCalculation)} =`
  return ''
}

function formatCalculation({ operation, operands }: Calculation): string {
  const [left, right] = operands.map(formatNumber)
  return ARITY[operation] === 1
    ? `${SYMBOLS[operation]}${left}`
    : `${left} ${SYMBOLS[operation]} ${right}`
}

/** Long numbers get a smaller font so they always fit on one line. */
function sizeFor(value: string): 'large' | 'medium' | 'small' {
  if (value.length <= 9) return 'large'
  if (value.length <= 13) return 'medium'
  return 'small'
}