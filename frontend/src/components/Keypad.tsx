import type { MouseEvent, ReactNode } from 'react'
import type { Operation } from '../api/types.ts'
import type { Digit } from '../lib/calculatorReducer.ts'

interface KeypadProps {
  onDigit: (digit: Digit) => void
  onDecimal: () => void
  onToggleSign: () => void
  onBackspace: () => void
  onClear: () => void
  onOperation: (operation: Operation) => void
  onEquals: () => void
}

export function Keypad(props: KeypadProps) {
  const { onDigit, onDecimal, onToggleSign, onBackspace, onClear, onOperation, onEquals } = props
  const digit = (d: Digit) => <Key variant="digit" onPress={() => onDigit(d)}>{d}</Key>

  return (
    <div className="keypad">
      <Key variant="edit" name="Clear all" onPress={onClear}>AC</Key>
      <Key variant="edit" name="Delete last digit" onPress={onBackspace}>⌫</Key>
      <Key variant="edit" name="Change sign" onPress={onToggleSign}>±</Key>
      <Key variant="operation" name="Divide" onPress={() => onOperation('divide')}>÷</Key>

      <Key variant="operation" name="Power" onPress={() => onOperation('power')}>
        x<sup>y</sup>
      </Key>
      <Key variant="operation" name="Percent of" onPress={() => onOperation('percentage')}>% of</Key>
      <Key variant="operation" name="Square root" onPress={() => onOperation('sqrt')}>√</Key>
      <Key variant="operation" name="Multiply" onPress={() => onOperation('multiply')}>×</Key>

      {digit('7')}
      {digit('8')}
      {digit('9')}
      <Key variant="operation" name="Subtract" onPress={() => onOperation('subtract')}>−</Key>

      {digit('4')}
      {digit('5')}
      {digit('6')}
      <Key variant="operation" name="Add" onPress={() => onOperation('add')}>+</Key>

      {digit('1')}
      {digit('2')}
      {digit('3')}
      <Key variant="equals" name="Equals" onPress={onEquals}>=</Key>

      <Key variant="digit" wide onPress={() => onDigit('0')}>0</Key>
      <Key variant="digit" name="Decimal point" onPress={onDecimal}>.</Key>
    </div>
  )
}

interface KeyProps {
  variant: 'digit' | 'edit' | 'operation' | 'equals'
  /** Spans two columns (the 0 key). */
  wide?: boolean
  /** Accessible name, for keys whose label is a symbol. */
  name?: string
  onPress: () => void
  children: ReactNode
}

function Key({ variant, wide = false, name, onPress, children }: KeyProps) {
  return (
    <button
      type="button"
      className={`key key--${variant}${wide ? ' key--wide' : ''}`}
      aria-label={name}
      onClick={onPress}
      // Keep focus where it was when clicking with a mouse, so pressing Enter
      // afterwards means "=" rather than clicking the last key again.
      onMouseDown={preventFocus}
    >
      {children}
    </button>
  )
}

function preventFocus(event: MouseEvent) {
  event.preventDefault()
}