import { describe, expect, it } from 'vitest'
import type { Operation } from '../api/types.ts'
import {
  calculatorReducer,
  displayText,
  initialState,
  MAX_DIGITS,
  type CalculatorAction,
  type CalculatorState,
  type Digit,
} from './calculatorReducer.ts'

// ---------- Test helpers ----------

/** Calculator keys as written in test cases, e.g. press('1 2 + 3 ='). */
const KEY_ACTIONS: Record<string, CalculatorAction> = {
  '.': { type: 'decimal' },
  '±': { type: 'toggleSign' },
  '⌫': { type: 'backspace' },
  AC: { type: 'clear' },
  '=': { type: 'equals' },
  '+': { type: 'operation', operation: 'add' },
  '−': { type: 'operation', operation: 'subtract' },
  '×': { type: 'operation', operation: 'multiply' },
  '÷': { type: 'operation', operation: 'divide' },
  '^': { type: 'operation', operation: 'power' },
  '%': { type: 'operation', operation: 'percentage' },
  '√': { type: 'operation', operation: 'sqrt' },
}

function toAction(key: string): CalculatorAction {
  if (/^[0-9]$/.test(key)) return { type: 'digit', digit: key as Digit }
  const action = KEY_ACTIONS[key]
  if (!action) throw new Error(`Unknown key in test: "${key}"`)
  return action
}

const FAKE_RESULTS: Record<Operation, (a: number, b: number) => number> = {
  add: (a, b) => a + b,
  subtract: (a, b) => a - b,
  multiply: (a, b) => a * b,
  divide: (a, b) => a / b,
  power: (a, b) => a ** b,
  sqrt: (a) => Math.sqrt(a),
  percentage: (a, b) => (a / 100) * b,
}

/** A fake backend that follows the real one's rules, answering instantly. */
function fakeApi(operation: Operation, [a, b]: number[]): CalculatorAction {
  if (operation === 'divide' && b === 0) {
    return { type: 'requestFailed', code: 'DIVISION_BY_ZERO', message: 'division by zero' }
  }
  if (operation === 'sqrt' && a < 0) {
    return { type: 'requestFailed', code: 'NEGATIVE_SQUARE_ROOT', message: 'negative' }
  }
  return { type: 'requestSucceeded', result: FAKE_RESULTS[operation](a, b) }
}

/**
 * Presses keys in order. By default, every request the reducer makes is
 * answered by fakeApi; with respond: false, requests stay in flight.
 */
function press(
  keys: string,
  { from = initialState, respond = true }: { from?: CalculatorState; respond?: boolean } = {},
): CalculatorState {
  let state = from
  for (const key of keys.split(' ')) {
    state = calculatorReducer(state, toAction(key))
    if (respond && state.request) {
      state = calculatorReducer(state, fakeApi(state.request.operation, state.request.operands))
    }
  }
  return state
}

const display = (state: CalculatorState) => displayText(state.entry)

/** n copies of a key, e.g. repeat('9', 3) = '9 9 9'. */
const repeat = (key: string, n: number) => Array(n).fill(key).join(' ')

// ---------- Tests ----------

describe('typing numbers', () => {
  it.each([
    { keys: '1 2', shows: '12', why: 'digits build up a number' },
    { keys: '0 5', shows: '5', why: 'a leading zero is replaced' },
    { keys: '0 0', shows: '0', why: 'zeros do not pile up' },
    { keys: '1 . 5', shows: '1.5', why: 'decimal point' },
    { keys: '1 . 5 . 2', shows: '1.52', why: 'only one decimal point' },
    { keys: '.', shows: '0.', why: 'a leading point starts with 0' },
    { keys: '5 ±', shows: '-5', why: 'sign toggle' },
    { keys: '5 ± ±', shows: '5', why: 'sign toggles back' },
    { keys: '± 7', shows: '-7', why: 'negative number started with ±' },
    { keys: '1 2 3 ⌫', shows: '12', why: 'backspace deletes the last digit' },
    { keys: '5 ⌫', shows: '0', why: 'backspace never leaves an empty display' },
    { keys: '5 ± ⌫', shows: '0', why: 'backspace never leaves a lone minus' },
    {
      keys: repeat('9', MAX_DIGITS + 2),
      shows: '9'.repeat(MAX_DIGITS),
      why: `at most ${MAX_DIGITS} digits`,
    },
    {
      keys: `± 1 . ${repeat('9', MAX_DIGITS)}`,
      shows: `-1.${'9'.repeat(MAX_DIGITS - 1)}`,
      why: 'sign and point do not count toward the limit',
    },
  ])('$why: $keys → $shows', ({ keys, shows }) => {
    expect(display(press(keys))).toBe(shows)
  })
})

describe('calculating', () => {
  it.each([
    { keys: '1 2 + 3 =', shows: '15', why: 'addition' },
    { keys: '1 0 − 4 =', shows: '6', why: 'subtraction' },
    { keys: '6 × 7 =', shows: '42', why: 'multiplication' },
    { keys: '1 0 ÷ 4 =', shows: '2.5', why: 'division' },
    { keys: '2 ^ 1 0 =', shows: '1024', why: 'power' },
    { keys: '9 √', shows: '3', why: 'square root computes immediately' },
    { keys: '2 0 % 1 5 0 =', shows: '30', why: 'percentage: 20% of 150' },
    { keys: '2 + 3 ×', shows: '5', why: 'chaining shows the intermediate result' },
    { keys: '2 + 3 × 4 =', shows: '20', why: 'chaining evaluates left to right' },
    { keys: '2 + × 3 =', shows: '6', why: 'a second operator replaces the first' },
    { keys: '2 + 9 √ =', shows: '5', why: 'a unary result becomes the right operand' },
    { keys: '5 + ± 3 =', shows: '2', why: '± after an operator starts a negative operand' },
    { keys: '0 . 1 + 0 . 2 =', shows: '0.3', why: 'results are formatted for display' },
    { keys: '0 . 1 + 0 . 2 = × 3 =', shows: '0.9', why: 'the exact result is carried forward' },
    { keys: '2 + 3 = 7', shows: '7', why: 'a digit after a result starts a new number' },
    { keys: '2 + 3 = × 2 =', shows: '10', why: 'an operator after a result continues from it' },
    { keys: '2 + 3 = ±', shows: '-5', why: '± negates a result' },
    { keys: '2 + 3 = ⌫', shows: '5', why: 'backspace does not edit a result' },
    { keys: '2 + 3 = .', shows: '0.', why: 'a point after a result starts a new number' },
    { keys: '4 =', shows: '4', why: '= without an operation does nothing' },
    { keys: '4 + =', shows: '4', why: '= without a second number does nothing' },
    { keys: '4 + ⌫', shows: '4', why: 'backspace does not edit the left operand' },
    { keys: '1 2 + 3 AC', shows: '0', why: 'AC resets everything' },
  ])('$why: $keys → $shows', ({ keys, shows }) => {
    expect(display(press(keys))).toBe(shows)
  })

  it('sends the typed numbers as the request', () => {
    const state = press('1 2 + 3 =', { respond: false })
    expect(state.request).toEqual({ operation: 'add', operands: [12, 3], then: null })
  })

  it('chains by calculating first, then continuing with the new operator', () => {
    const chained = press('2 + 3 ×', { respond: false })
    expect(chained.request).toEqual({ operation: 'add', operands: [2, 3], then: 'multiply' })

    const answered = calculatorReducer(chained, { type: 'requestSucceeded', result: 5 })
    expect(answered.pending).toEqual({ left: 5, operation: 'multiply' })
  })

  it('carries the exact value, not the rounded one, into the next calculation', () => {
    const first = press('0 . 1 + 0 . 2 =')
    expect(display(first)).toBe('0.3')

    const second = press('× 3 =', { from: first, respond: false })
    expect(second.request?.operands).toEqual([0.1 + 0.2, 3])
  })

  it('exposes the pending operation and the last calculation for the tape', () => {
    expect(press('1 2 +').pending).toEqual({ left: 12, operation: 'add' })

    const done = press('1 2 + 3 =')
    expect(done.pending).toBeNull()
    expect(done.lastCalculation).toEqual({ operation: 'add', operands: [12, 3] })
  })
})

describe('errors', () => {
  it('records the error and keeps the calculation as it was', () => {
    const state = press('5 ÷ 0 =')
    expect(state.error).toEqual({ code: 'DIVISION_BY_ZERO', message: 'division by zero' })
    expect(display(state)).toBe('0')
    expect(state.pending).toEqual({ left: 5, operation: 'divide' })
    expect(state.request).toBeNull()
  })

  it('lets the user fix the input and retry', () => {
    const state = press('5 ÷ 0 = ⌫ 2 =')
    expect(display(state)).toBe('2.5')
    expect(state.error).toBeNull()
  })

  it('is dismissed by the next key press', () => {
    expect(press('5 ÷ 0 = 1').error).toBeNull()
  })

  it('reports unary errors too', () => {
    expect(press('4 ± √').error?.code).toBe('NEGATIVE_SQUARE_ROOT')
  })

  it('never sends a non-finite operand', () => {
    const corrupted: CalculatorState = { ...initialState, entry: { kind: 'result', value: NaN } }
    const state = press('+ 1 =', { from: corrupted, respond: false })
    expect(state.request).toBeNull()
    expect(state.error?.code).toBe('INVALID_OPERAND')
  })
})

describe('while a request is in flight', () => {
  const inFlight = press('1 + 2 =', { respond: false })

  it('ignores input', () => {
    for (const key of ['9', '.', '±', '⌫', '+', '=']) {
      expect(calculatorReducer(inFlight, toAction(key))).toBe(inFlight)
    }
  })

  it('still allows AC', () => {
    expect(calculatorReducer(inFlight, { type: 'clear' })).toEqual(initialState)
  })
})

describe('stale responses', () => {
  it('ignores a success when no request is in flight', () => {
    const action: CalculatorAction = { type: 'requestSucceeded', result: 42 }
    expect(calculatorReducer(initialState, action)).toBe(initialState)
  })

  it('ignores a failure when no request is in flight', () => {
    const action: CalculatorAction = { type: 'requestFailed', code: 'INTERNAL_ERROR', message: 'x' }
    expect(calculatorReducer(initialState, action)).toBe(initialState)
  })
})

describe('purity', () => {
  it('never modifies the previous state', () => {
    const before = press('1 2 +')
    const snapshot = structuredClone(before)
    press('3 =', { from: before })
    expect(before).toEqual(snapshot)
  })
})