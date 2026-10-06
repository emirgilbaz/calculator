/**
 * Connects the pure calculator reducer to React and to the backend.
 * Components get display-ready values and stable action functions;
 * they never see fetch, status codes or raw API errors.
 */
import { useEffect, useMemo, useReducer } from 'react'
import { calculate, CalculatorError, type CalculatorErrorCode } from '../api/client.ts'
import type { Operation } from '../api/types.ts'
import {
  calculatorReducer,
  displayText,
  initialState,
  type Digit,
} from '../lib/calculatorReducer.ts'

/** What users see for each error. A Record, so every code must have a message. */
const ERROR_MESSAGES: Record<CalculatorErrorCode, string> = {
  DIVISION_BY_ZERO: "Can't divide by zero.",
  NEGATIVE_SQUARE_ROOT: "Can't take the square root of a negative number.",
  UNDEFINED_RESULT: "This calculation doesn't have a real-number result.",
  RESULT_OUT_OF_RANGE: 'The result is too large to calculate.',
  INVALID_OPERAND: 'Enter a valid number.',
  SERVICE_UNAVAILABLE: "Can't reach the calculator service. Check that the backend is running.",
  // The codes below mean the request itself was malformed: a bug, not a user mistake.
  INVALID_JSON: 'Something went wrong. Try again.',
  UNSUPPORTED_MEDIA_TYPE: 'Something went wrong. Try again.',
  PAYLOAD_TOO_LARGE: 'Something went wrong. Try again.',
  UNKNOWN_OPERATION: 'Something went wrong. Try again.',
  INVALID_OPERAND_COUNT: 'Something went wrong. Try again.',
  INTERNAL_ERROR: 'Something went wrong. Try again.',
  UNEXPECTED_RESPONSE: 'Something went wrong. Try again.',
}

export function useCalculator() {
  const [state, dispatch] = useReducer(calculatorReducer, initialState)
  const { request } = state

  // Perform the request the reducer asked for. When `request` changes or the
  // component unmounts, the cleanup aborts the old request, so a stale
  // response can never overwrite newer state.
  useEffect(() => {
    if (!request) return
    const controller = new AbortController()

    const run = async () => {
      try {
        const response = await calculate(
          { operation: request.operation, operands: request.operands },
          controller.signal,
        )
        if (!controller.signal.aborted) {
          dispatch({ type: 'requestSucceeded', result: response.result })
        }
      } catch (err) {
        if (controller.signal.aborted) return
        if (err instanceof CalculatorError) {
          dispatch({ type: 'requestFailed', code: err.code, message: err.message })
        } else {
          dispatch({ type: 'requestFailed', code: 'UNEXPECTED_RESPONSE', message: String(err) })
        }
      }
    }
    void run()

    return () => controller.abort()
  }, [request])

  // dispatch never changes, so these functions are created once.
  const actions = useMemo(
    () => ({
      inputDigit: (digit: Digit) => dispatch({ type: 'digit', digit }),
      inputDecimal: () => dispatch({ type: 'decimal' }),
      toggleSign: () => dispatch({ type: 'toggleSign' }),
      backspace: () => dispatch({ type: 'backspace' }),
      clear: () => dispatch({ type: 'clear' }),
      chooseOperation: (operation: Operation) => dispatch({ type: 'operation', operation }),
      equals: () => dispatch({ type: 'equals' }),
    }),
    [],
  )

  return {
    display: displayText(state.entry),
    pending: state.pending,
    lastCalculation: state.lastCalculation,
    isLoading: request !== null,
    errorMessage: state.error
      ? (ERROR_MESSAGES[state.error.code] ?? state.error.message)
      : null,
    ...actions,
  }
}