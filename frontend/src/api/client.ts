import type {
  ApiErrorBody,
  ApiErrorCode,
  CalculateRequest,
  CalculateResponse,
} from './types.ts'

const CALCULATE_URL = '/api/v1/calculate'

/** Failures detected by the client itself, not reported by the API. */
export type ClientErrorCode = 'SERVICE_UNAVAILABLE' | 'UNEXPECTED_RESPONSE'

export type CalculatorErrorCode = ApiErrorCode | ClientErrorCode

/** The single error type thrown by calculate(), whatever went wrong. */
export class CalculatorError extends Error {
  readonly code: CalculatorErrorCode
  readonly status?: number

  constructor(code: CalculatorErrorCode, message: string, status?: number) {
    super(message)
    this.name = 'CalculatorError'
    this.code = code
    this.status = status
  }
}

/**
 * Sends a calculation to the backend.
 * Resolves with the response, or rejects with a CalculatorError.
 * If `signal` is aborted, the original AbortError is rethrown so callers can ignore it.
 */
export async function calculate(
  request: CalculateRequest,
  signal?: AbortSignal,
): Promise<CalculateResponse> {
  let response: Response
  try {
    response = await fetch(CALCULATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    })
  } catch (err) {
    if (signal?.aborted) throw err
    throw new CalculatorError(
      'SERVICE_UNAVAILABLE',
      'Cannot reach the calculator service. Check that the backend is running.',
    )
  }

  // The body may not be JSON (e.g. a proxy error page), so never assume it is.
  const body: unknown = await response.json().catch(() => undefined)

  if (response.ok && isCalculateResponse(body)) {
    return body
  }
  if (!response.ok && isApiErrorBody(body)) {
    throw new CalculatorError(body.error.code, body.error.message, response.status)
  }
  if (response.status >= 500) {
    throw new CalculatorError(
      'SERVICE_UNAVAILABLE',
      'The calculator service is unavailable. Try again in a moment.',
      response.status,
    )
  }
  throw new CalculatorError(
    'UNEXPECTED_RESPONSE',
    `Unexpected response from the server (HTTP ${response.status}).`,
    response.status,
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isCalculateResponse(value: unknown): value is CalculateResponse {
  return isRecord(value) && typeof value.result === 'number'
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    isRecord(value) &&
    isRecord(value.error) &&
    typeof value.error.code === 'string' &&
    typeof value.error.message === 'string'
  )
}