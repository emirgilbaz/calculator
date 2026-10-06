/**
 * TypeScript mirror of the backend API contract
 * (backend/internal/api/types.go). Keep the two in sync.
 */

/** Operations supported by POST /api/v1/calculate. */
export type Operation =
  | 'add'
  | 'subtract'
  | 'multiply'
  | 'divide'
  | 'power'
  | 'sqrt'
  | 'percentage'

/**
 * How many operands each operation takes, mirroring the backend registry.
 * Typed as Record<Operation, ...> so the compiler fails if one is missing.
 * The backend still validates this; the frontend uses it to shape the UI.
 */
export const ARITY: Record<Operation, 1 | 2> = {
  add: 2,
  subtract: 2,
  multiply: 2,
  divide: 2,
  power: 2,
  sqrt: 1,
  percentage: 2,
}

/** Body of POST /api/v1/calculate. */
export interface CalculateRequest {
  operation: Operation
  operands: number[]
}

/** Successful (200) response. */
export interface CalculateResponse {
  operation: Operation
  operands: number[]
  result: number
}

/** Error codes the backend can return (the Code* constants in types.go). */
export type ApiErrorCode =
  | 'INVALID_JSON'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNKNOWN_OPERATION'
  | 'INVALID_OPERAND_COUNT'
  | 'INVALID_OPERAND'
  | 'DIVISION_BY_ZERO'
  | 'NEGATIVE_SQUARE_ROOT'
  | 'UNDEFINED_RESULT'
  | 'RESULT_OUT_OF_RANGE'
  | 'INTERNAL_ERROR'

/** Error envelope the backend sends with every error response. */
export interface ApiErrorBody {
  error: {
    code: ApiErrorCode
    message: string
  }
}