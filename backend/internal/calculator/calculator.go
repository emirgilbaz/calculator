// Package calculator contains the pure arithmetic logic of the service.
// It has no knowledge of HTTP or JSON, which keeps it trivially testable.
package calculator

import (
	"errors"
	"fmt"
	"math"
	"sort"
)

// Operation identifies a supported arithmetic operation.
type Operation string

const (
	Add        Operation = "add"
	Subtract   Operation = "subtract"
	Multiply   Operation = "multiply"
	Divide     Operation = "divide"
	Power      Operation = "power"
	Sqrt       Operation = "sqrt"
	Percentage Operation = "percentage"
)

// Sentinel errors let callers (e.g. the HTTP layer) map failures to
// status codes with errors.Is, without string matching.
var (
	ErrUnknownOperation    = errors.New("unknown operation")
	ErrInvalidOperandCount = errors.New("invalid number of operands")
	ErrInvalidOperand      = errors.New("operand must be a finite number")
	ErrDivisionByZero      = errors.New("division by zero")
	ErrNegativeSquareRoot  = errors.New("square root of a negative number")
	ErrUndefinedResult     = errors.New("result is undefined")
	ErrResultOutOfRange    = errors.New("result is out of range")
)

type spec struct {
	arity int
	apply func(x []float64) (float64, error)
}

// registry is the single source of truth for supported operations.
// Adding an operation means adding one entry here plus its tests.
var registry = map[Operation]spec{
	Add:      {2, func(x []float64) (float64, error) { return x[0] + x[1], nil }},
	Subtract: {2, func(x []float64) (float64, error) { return x[0] - x[1], nil }},
	Multiply: {2, func(x []float64) (float64, error) { return x[0] * x[1], nil }},
	Divide: {2, func(x []float64) (float64, error) {
		if x[1] == 0 {
			return 0, ErrDivisionByZero
		}
		return x[0] / x[1], nil
	}},
	Power: {2, func(x []float64) (float64, error) { return math.Pow(x[0], x[1]), nil }},
	Sqrt: {1, func(x []float64) (float64, error) {
		if x[0] < 0 {
			return 0, ErrNegativeSquareRoot
		}
		return math.Sqrt(x[0]), nil
	}},
	// Percentage computes "x[0] percent of x[1]", e.g. 20% of 150 = 30.
	Percentage: {2, func(x []float64) (float64, error) { return x[0] / 100 * x[1], nil }},
}

// Arity returns how many operands op expects.
func Arity(op Operation) (int, error) {
	s, ok := registry[op]
	if !ok {
		return 0, fmt.Errorf("%w: %q", ErrUnknownOperation, op)
	}
	return s.arity, nil
}

// Operations returns all supported operations in a stable order.
func Operations() []Operation {
	ops := make([]Operation, 0, len(registry))
	for op := range registry {
		ops = append(ops, op)
	}
	sort.Slice(ops, func(i, j int) bool { return ops[i] < ops[j] })
	return ops
}

// Calculate validates the inputs and applies op to operands.
// It never returns NaN or ±Inf: such results are reported as errors.
func Calculate(op Operation, operands []float64) (float64, error) {
	s, ok := registry[op]
	if !ok {
		return 0, fmt.Errorf("%w: %q", ErrUnknownOperation, op)
	}
	if len(operands) != s.arity {
		return 0, fmt.Errorf("%w: %q expects %d, got %d", ErrInvalidOperandCount, op, s.arity, len(operands))
	}
	for i, v := range operands {
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return 0, fmt.Errorf("%w (operand %d)", ErrInvalidOperand, i)
		}
	}

	result, err := s.apply(operands)
	if err != nil {
		return 0, err
	}
	switch {
	case math.IsNaN(result):
		return 0, ErrUndefinedResult // e.g. (-8)^0.5
	case math.IsInf(result, 0):
		return 0, ErrResultOutOfRange // e.g. 1e308 * 10, 0^-1
	}
	// Normalise -0 to 0 so clients never display "-0".
	if result == 0 {
		result = 0
	}
	return result, nil
}
