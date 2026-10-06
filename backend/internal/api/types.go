package api

// CalculateRequest is the body of POST /api/v1/calculate.
// Operands are pointers so that an explicit JSON null can be rejected
// instead of silently decoding to 0.
type CalculateRequest struct {
	Operation string     `json:"operation"`
	Operands  []*float64 `json:"operands"`
}

// CalculateResponse is returned on success.
type CalculateResponse struct {
	Operation string    `json:"operation"`
	Operands  []float64 `json:"operands"`
	Result    float64   `json:"result"`
}

// ErrorResponse is the single error envelope used by every endpoint.
type ErrorResponse struct {
	Error ErrorBody `json:"error"`
}

// ErrorBody carries a stable, machine-readable code and a human message.
type ErrorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// Error codes are part of the public API contract; clients may switch on them.
const (
	CodeInvalidJSON         = "INVALID_JSON"
	CodeUnsupportedMedia    = "UNSUPPORTED_MEDIA_TYPE"
	CodePayloadTooLarge     = "PAYLOAD_TOO_LARGE"
	CodeUnknownOperation    = "UNKNOWN_OPERATION"
	CodeInvalidOperandCount = "INVALID_OPERAND_COUNT"
	CodeInvalidOperand      = "INVALID_OPERAND"
	CodeDivisionByZero      = "DIVISION_BY_ZERO"
	CodeNegativeSquareRoot  = "NEGATIVE_SQUARE_ROOT"
	CodeUndefinedResult     = "UNDEFINED_RESULT"
	CodeResultOutOfRange    = "RESULT_OUT_OF_RANGE"
	CodeInternal            = "INTERNAL_ERROR"
)
