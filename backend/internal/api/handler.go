// Package api exposes the calculator over HTTP/JSON.
package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"strings"

	"github.com/emirgilbaz/calculator/backend/internal/calculator"
)

const maxBodyBytes = 1 << 20 // 1 MiB is far more than any valid request needs.

// Config holds the HTTP layer's settings.
type Config struct {
	// AllowedOrigin is sent as Access-Control-Allow-Origin. Empty disables CORS.
	AllowedOrigin string
}

// NewRouter builds the full HTTP handler, including middleware.
func NewRouter(logger *slog.Logger, cfg Config) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", handleHealth)
	mux.HandleFunc("POST /api/v1/calculate", handleCalculate)

	return chain(mux,
		recoverer(logger),
		requestLogger(logger),
		cors(cfg.AllowedOrigin),
	)
}

func handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func handleCalculate(w http.ResponseWriter, r *http.Request) {
	if !isJSON(r.Header.Get("Content-Type")) {
		writeError(w, http.StatusUnsupportedMediaType, CodeUnsupportedMedia,
			"Content-Type must be application/json")
		return
	}

	req, status, code, err := decodeRequest(w, r)
	if err != nil {
		writeError(w, status, code, err.Error())
		return
	}

	operands := make([]float64, len(req.Operands))
	for i, p := range req.Operands {
		if p == nil {
			writeError(w, http.StatusBadRequest, CodeInvalidOperand,
				fmt.Sprintf("operand %d must be a number, got null", i))
			return
		}
		operands[i] = *p
	}

	op := calculator.Operation(req.Operation)
	result, err := calculator.Calculate(op, operands)
	if err != nil {
		status, code := mapError(err)
		msg := err.Error()
		if code == CodeUnknownOperation {
			msg = fmt.Sprintf("%s; supported operations: %s", msg, supportedOps())
		}
		writeError(w, status, code, msg)
		return
	}

	writeJSON(w, http.StatusOK, CalculateResponse{
		Operation: req.Operation,
		Operands:  operands,
		Result:    result,
	})
}

// decodeRequest strictly parses the body: unknown fields, trailing data and
// oversized payloads are all rejected.
func decodeRequest(w http.ResponseWriter, r *http.Request) (CalculateRequest, int, string, error) {
	var req CalculateRequest
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()

	if err := dec.Decode(&req); err != nil {
		var tooLarge *http.MaxBytesError
		var typeErr *json.UnmarshalTypeError
		switch {
		case errors.As(err, &tooLarge):
			return req, http.StatusRequestEntityTooLarge, CodePayloadTooLarge, errors.New("request body too large")
		case errors.As(err, &typeErr):
			return req, http.StatusBadRequest, CodeInvalidJSON,
				fmt.Errorf("field %q must be of type %s", typeErr.Field, typeErr.Type)
		case errors.Is(err, io.EOF):
			return req, http.StatusBadRequest, CodeInvalidJSON, errors.New("request body is empty")
		default:
			return req, http.StatusBadRequest, CodeInvalidJSON, fmt.Errorf("malformed JSON: %v", err)
		}
	}
	if dec.More() {
		return req, http.StatusBadRequest, CodeInvalidJSON, errors.New("request body must contain a single JSON object")
	}
	return req, 0, "", nil
}

// mapError translates domain errors into HTTP semantics:
// 400 = the request itself is invalid; 422 = valid request, but the maths
// cannot produce a result (e.g. division by zero).
func mapError(err error) (int, string) {
	switch {
	case errors.Is(err, calculator.ErrUnknownOperation):
		return http.StatusBadRequest, CodeUnknownOperation
	case errors.Is(err, calculator.ErrInvalidOperandCount):
		return http.StatusBadRequest, CodeInvalidOperandCount
	case errors.Is(err, calculator.ErrInvalidOperand):
		return http.StatusBadRequest, CodeInvalidOperand
	case errors.Is(err, calculator.ErrDivisionByZero):
		return http.StatusUnprocessableEntity, CodeDivisionByZero
	case errors.Is(err, calculator.ErrNegativeSquareRoot):
		return http.StatusUnprocessableEntity, CodeNegativeSquareRoot
	case errors.Is(err, calculator.ErrUndefinedResult):
		return http.StatusUnprocessableEntity, CodeUndefinedResult
	case errors.Is(err, calculator.ErrResultOutOfRange):
		return http.StatusUnprocessableEntity, CodeResultOutOfRange
	default:
		return http.StatusInternalServerError, CodeInternal
	}
}

func supportedOps() string {
	ops := calculator.Operations()
	names := make([]string, len(ops))
	for i, op := range ops {
		names[i] = string(op)
	}
	return strings.Join(names, ", ")
}

func isJSON(contentType string) bool {
	mt, _, err := mime.ParseMediaType(contentType)
	return err == nil && mt == "application/json"
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, code, msg string) {
	writeJSON(w, status, ErrorResponse{Error: ErrorBody{Code: code, Message: msg}})
}
