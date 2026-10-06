/**
 * Pure state logic of the calculator: (state, action) => next state.
 *
 * It decides WHAT to calculate by setting `request`, but never calls the API
 * itself. The useCalculator hook performs the request and reports back with
 * `requestSucceeded` / `requestFailed`. This keeps all behavior testable
 * without React or a network.
 */
import { ARITY, type Operation } from '../api/types.ts'
import type { CalculatorErrorCode } from '../api/client.ts'
import { formatNumber } from './format.ts'

/** Longest number a user can type: float64 only keeps ~15-17 significant digits. */
export const MAX_DIGITS = 15

export type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'

/** What the main display holds: text being typed, or an exact result from the API. */
export type Entry =
  | { kind: 'input'; text: string }
  | { kind: 'result'; value: number }

export interface Calculation {
  operation: Operation
  operands: number[]
}

export interface CalculatorState {
  entry: Entry
  /** A binary operation waiting for its right operand, e.g. "12 +". */
  pending: { left: number; operation: Operation } | null
  /** True right after choosing an operation: the next digit starts a new number. */
  awaitingOperand: boolean
  /** The calculation to send to the API; `then` continues a chain like "2 + 3 ×". */
  request: (Calculation & { then: Operation | null }) | null
  /** The last successful calculation, shown above the display. */
  lastCalculation: Calculation | null
  error: { code: CalculatorErrorCode; message: string } | null
}

export type CalculatorAction =
  | { type: 'digit'; digit: Digit }
  | { type: 'decimal' }
  | { type: 'toggleSign' }
  | { type: 'backspace' }
  | { type: 'clear' }
  | { type: 'operation'; operation: Operation }
  | { type: 'equals' }
  | { type: 'requestSucceeded'; result: number }
  | { type: 'requestFailed'; code: CalculatorErrorCode; message: string }

export const initialState: CalculatorState = {
  entry: { kind: 'input', text: '0' },
  pending: null,
  awaitingOperand: false,
  request: null,
  lastCalculation: null,
  error: null,
}

export function calculatorReducer(
  state: CalculatorState,
  action: CalculatorAction,
): CalculatorState {
  switch (action.type) {
    case 'clear':
      return initialState
    case 'requestSucceeded':
      return state.request ? succeed(state, state.request, action.result) : state
    case 'requestFailed':
      return state.request
        ? { ...state, request: null, error: { code: action.code, message: action.message } }
        : state
  }

  // Input is paused while a calculation is in flight.
  if (state.request) return state

  // Any key press dismisses the previous error.
  const current: CalculatorState = { ...state, error: null }

  switch (action.type) {
    case 'digit':
      return inputDigit(current, action.digit)
    case 'decimal':
      return inputDecimal(current)
    case 'toggleSign':
      return toggleSign(current)
    case 'backspace':
      return backspace(current)
    case 'operation':
      return chooseOperation(current, action.operation)
    case 'equals':
      return equals(current)
  }
}

/** The text shown on the main display. */
export function displayText(entry: Entry): string {
  return entry.kind === 'input' ? entry.text : formatNumber(entry.value)
}

function inputDigit(state: CalculatorState, digit: Digit): CalculatorState {
  const { entry } = state
  if (state.awaitingOperand || entry.kind === 'result') {
    return withText(state, digit)
  }
  if (countDigits(entry.text) >= MAX_DIGITS) return state
  if (entry.text === '0') return withText(state, digit)
  if (entry.text === '-0') return withText(state, `-${digit}`)
  return withText(state, entry.text + digit)
}

function inputDecimal(state: CalculatorState): CalculatorState {
  const { entry } = state
  if (state.awaitingOperand || entry.kind === 'result') {
    return withText(state, '0.')
  }
  if (entry.text.includes('.')) return state
  return withText(state, `${entry.text}.`)
}

function toggleSign(state: CalculatorState): CalculatorState {
  const { entry } = state
  if (state.awaitingOperand) return withText(state, '-0')
  if (entry.kind === 'result') {
    return { ...state, entry: { kind: 'result', value: -entry.value } }
  }
  const text = entry.text.startsWith('-') ? entry.text.slice(1) : `-${entry.text}`
  return withText(state, text)
}

function backspace(state: CalculatorState): CalculatorState {
  const { entry } = state
  if (state.awaitingOperand || entry.kind === 'result') return state
  const text = entry.text.slice(0, -1)
  return withText(state, text === '' || text === '-' ? '0' : text)
}

function chooseOperation(state: CalculatorState, operation: Operation): CalculatorState {
  const value = currentValue(state)

  if (ARITY[operation] === 1) {
    return startRequest(state, { operation, operands: [value] }, null)
  }
  if (state.pending && !state.awaitingOperand) {
    // Chain: "2 + 3 ×" first calculates 2 + 3, then continues with ×.
    const { left, operation: pendingOperation } = state.pending
    return startRequest(state, { operation: pendingOperation, operands: [left, value] }, operation)
  }
  if (state.pending) {
    // Two operators in a row: the latest one wins.
    return { ...state, pending: { ...state.pending, operation } }
  }
  return { ...state, pending: { left: value, operation }, awaitingOperand: true }
}

function equals(state: CalculatorState): CalculatorState {
  if (!state.pending || state.awaitingOperand) return state
  const { left, operation } = state.pending
  return startRequest(state, { operation, operands: [left, currentValue(state)] }, null)
}

function startRequest(
  state: CalculatorState,
  calculation: Calculation,
  then: Operation | null,
): CalculatorState {
  if (!calculation.operands.every(Number.isFinite)) {
    return { ...state, error: { code: 'INVALID_OPERAND', message: 'Enter a valid number.' } }
  }
  return { ...state, request: { ...calculation, then } }
}

function succeed(
  state: CalculatorState,
  request: NonNullable<CalculatorState['request']>,
  result: number,
): CalculatorState {
  const next: CalculatorState = {
    ...state,
    entry: { kind: 'result', value: result },
    request: null,
    lastCalculation: { operation: request.operation, operands: request.operands },
    error: null,
  }
  if (request.then) {
    return { ...next, pending: { left: result, operation: request.then }, awaitingOperand: true }
  }
  if (ARITY[request.operation] === 1) {
    // A unary result (e.g. √9) can become the right operand of a pending "2 +".
    return { ...next, awaitingOperand: false }
  }
  return { ...next, pending: null, awaitingOperand: false }
}

function currentValue(state: CalculatorState): number {
  return state.entry.kind === 'result' ? state.entry.value : Number(state.entry.text)
}

function withText(state: CalculatorState, text: string): CalculatorState {
  return { ...state, entry: { kind: 'input', text }, awaitingOperand: false }
}

function countDigits(text: string): number {
  return text.replace(/\D/g, '').length
}