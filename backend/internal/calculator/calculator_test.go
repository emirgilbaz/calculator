package calculator

import (
	"errors"
	"math"
	"testing"
)

func TestCalculate(t *testing.T) {
	tests := []struct {
		name     string
		op       Operation
		operands []float64
		want     float64
		wantErr  error
	}{
		// Happy paths
		{"add", Add, []float64{2, 3}, 5, nil},
		{"add negatives", Add, []float64{-2, -3}, -5, nil},
		{"add decimals", Add, []float64{0.5, 0.25}, 0.75, nil},
		{"subtract", Subtract, []float64{10, 4}, 6, nil},
		{"subtract to negative", Subtract, []float64{4, 10}, -6, nil},
		{"multiply", Multiply, []float64{6, 7}, 42, nil},
		{"multiply by zero", Multiply, []float64{123, 0}, 0, nil},
		{"multiply negative by zero gives +0", Multiply, []float64{-5, 0}, 0, nil},
		{"divide", Divide, []float64{10, 4}, 2.5, nil},
		{"divide zero by number", Divide, []float64{0, 5}, 0, nil},
		{"power", Power, []float64{2, 10}, 1024, nil},
		{"power negative exponent", Power, []float64{2, -1}, 0.5, nil},
		{"power zero exponent", Power, []float64{7, 0}, 1, nil},
		{"power negative base integer exponent", Power, []float64{-2, 3}, -8, nil},
		{"sqrt", Sqrt, []float64{16}, 4, nil},
		{"sqrt zero", Sqrt, []float64{0}, 0, nil},
		{"percentage", Percentage, []float64{20, 150}, 30, nil},
		{"percentage over 100", Percentage, []float64{150, 20}, 30, nil},

		// Domain errors
		{"divide by zero", Divide, []float64{1, 0}, 0, ErrDivisionByZero},
		{"zero divided by zero", Divide, []float64{0, 0}, 0, ErrDivisionByZero},
		{"sqrt negative", Sqrt, []float64{-1}, 0, ErrNegativeSquareRoot},
		{"power undefined (negative base fractional exp)", Power, []float64{-8, 0.5}, 0, ErrUndefinedResult},
		{"power overflow", Power, []float64{10, 400}, 0, ErrResultOutOfRange},
		{"zero to negative power", Power, []float64{0, -1}, 0, ErrResultOutOfRange},
		{"multiply overflow", Multiply, []float64{math.MaxFloat64, 2}, 0, ErrResultOutOfRange},
		{"add overflow", Add, []float64{math.MaxFloat64, math.MaxFloat64}, 0, ErrResultOutOfRange},

		// Input validation
		{"unknown operation", Operation("modulo"), []float64{1, 2}, 0, ErrUnknownOperation},
		{"empty operation", Operation(""), []float64{1, 2}, 0, ErrUnknownOperation},
		{"too few operands", Add, []float64{1}, 0, ErrInvalidOperandCount},
		{"too many operands", Sqrt, []float64{1, 2}, 0, ErrInvalidOperandCount},
		{"nil operands", Add, nil, 0, ErrInvalidOperandCount},
		{"NaN operand", Add, []float64{math.NaN(), 1}, 0, ErrInvalidOperand},
		{"Inf operand", Add, []float64{1, math.Inf(1)}, 0, ErrInvalidOperand},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := Calculate(tc.op, tc.operands)
			if tc.wantErr != nil {
				if !errors.Is(err, tc.wantErr) {
					t.Fatalf("error = %v, want %v", err, tc.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tc.want {
				t.Fatalf("got %v, want %v", got, tc.want)
			}
			if math.Signbit(got) && got == 0 {
				t.Fatalf("got negative zero")
			}
		})
	}
}

func TestArity(t *testing.T) {
	cases := map[Operation]int{Add: 2, Subtract: 2, Multiply: 2, Divide: 2, Power: 2, Percentage: 2, Sqrt: 1}
	for op, want := range cases {
		got, err := Arity(op)
		if err != nil || got != want {
			t.Errorf("Arity(%q) = %d, %v; want %d, nil", op, got, err, want)
		}
	}
	if _, err := Arity("nope"); !errors.Is(err, ErrUnknownOperation) {
		t.Errorf("Arity(unknown) error = %v, want ErrUnknownOperation", err)
	}
}

func TestOperationsIsSortedAndComplete(t *testing.T) {
	ops := Operations()
	if len(ops) != len(registry) {
		t.Fatalf("got %d operations, want %d", len(ops), len(registry))
	}
	for i := 1; i < len(ops); i++ {
		if ops[i-1] >= ops[i] {
			t.Fatalf("operations not sorted: %v", ops)
		}
	}
}
