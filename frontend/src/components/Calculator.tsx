import { useEffect } from 'react'
import type { Operation } from '../api/types.ts'
import type { Digit } from '../lib/calculatorReducer.ts'
import { useCalculator } from '../hooks/useCalculator.ts'
import { Display } from './Display.tsx'
import { Keypad } from './Keypad.tsx'

/** Keyboard keys that choose an operation. */
const KEY_OPERATIONS = new Map<string, Operation>([
  ['+', 'add'],
  ['-', 'subtract'],
  ['*', 'multiply'],
  ['x', 'multiply'],
  ['/', 'divide'],
  ['^', 'power'],
  ['%', 'percentage'],
  ['r', 'sqrt'],
])

export function Calculator() {
  const calc = useCalculator()
  const { inputDigit, inputDecimal, backspace, clear, chooseOperation, equals } = calc

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      // Let Enter/Space activate a key that has keyboard focus.
      if (event.target instanceof HTMLButtonElement && (event.key === 'Enter' || event.key === ' ')) {
        return
      }

      const { key } = event
      const operation = KEY_OPERATIONS.get(key.toLowerCase())
      if (isDigit(key)) inputDigit(key)
      else if (key === '.' || key === ',') inputDecimal()
      else if (operation) chooseOperation(operation)
      else if (key === 'Enter' || key === '=') equals()
      else if (key === 'Backspace') backspace()
      else if (key === 'Escape' || key === 'Delete') clear()
      else return

      event.preventDefault()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [inputDigit, inputDecimal, backspace, clear, chooseOperation, equals])

  return (
    <section className="calculator" aria-label="Calculator" aria-busy={calc.isLoading}>
      <Display
        value={calc.display}
        pending={calc.pending}
        lastCalculation={calc.lastCalculation}
        errorMessage={calc.errorMessage}
      />
      <Keypad
        onDigit={inputDigit}
        onDecimal={inputDecimal}
        onToggleSign={calc.toggleSign}
        onBackspace={backspace}
        onClear={clear}
        onOperation={chooseOperation}
        onEquals={equals}
      />
    </section>
  )
}

function isDigit(key: string): key is Digit {
  return /^[0-9]$/.test(key)
}