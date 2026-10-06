package api

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func newTestServer(t *testing.T, origin string) http.Handler {
	t.Helper()
	return NewRouter(slog.New(slog.NewTextHandler(io.Discard, nil)), Config{AllowedOrigin: origin})
}

func do(t *testing.T, h http.Handler, method, path, contentType, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestCalculate_Success(t *testing.T) {
	h := newTestServer(t, "")
	tests := []struct {
		name string
		body string
		want float64
	}{
		{"add", `{"operation":"add","operands":[2,3]}`, 5},
		{"subtract", `{"operation":"subtract","operands":[2,3]}`, -1},
		{"multiply", `{"operation":"multiply","operands":[2.5,4]}`, 10},
		{"divide", `{"operation":"divide","operands":[1,4]}`, 0.25},
		{"power", `{"operation":"power","operands":[2,8]}`, 256},
		{"sqrt", `{"operation":"sqrt","operands":[81]}`, 9},
		{"percentage", `{"operation":"percentage","operands":[10,250]}`, 25},
		{"scientific notation", `{"operation":"multiply","operands":[1e3,2E-3]}`, 2},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			rec := do(t, h, http.MethodPost, "/api/v1/calculate", "application/json", tc.body)
			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d, body = %s", rec.Code, rec.Body)
			}
			if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
				t.Fatalf("Content-Type = %q", ct)
			}
			var resp CalculateResponse
			if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
				t.Fatalf("invalid JSON response: %v", err)
			}
			if resp.Result != tc.want {
				t.Fatalf("result = %v, want %v", resp.Result, tc.want)
			}
		})
	}
}

func TestCalculate_Errors(t *testing.T) {
	h := newTestServer(t, "")
	tests := []struct {
		name        string
		contentType string
		body        string
		wantStatus  int
		wantCode    string
	}{
		{"division by zero", "application/json", `{"operation":"divide","operands":[1,0]}`, 422, CodeDivisionByZero},
		{"negative sqrt", "application/json", `{"operation":"sqrt","operands":[-4]}`, 422, CodeNegativeSquareRoot},
		{"undefined power", "application/json", `{"operation":"power","operands":[-8,0.5]}`, 422, CodeUndefinedResult},
		{"overflow", "application/json", `{"operation":"power","operands":[10,400]}`, 422, CodeResultOutOfRange},
		{"unknown op", "application/json", `{"operation":"modulo","operands":[1,2]}`, 400, CodeUnknownOperation},
		{"missing op", "application/json", `{"operands":[1,2]}`, 400, CodeUnknownOperation},
		{"too few operands", "application/json", `{"operation":"add","operands":[1]}`, 400, CodeInvalidOperandCount},
		{"missing operands", "application/json", `{"operation":"add"}`, 400, CodeInvalidOperandCount},
		{"null operand", "application/json", `{"operation":"add","operands":[1,null]}`, 400, CodeInvalidOperand},
		{"string operand", "application/json", `{"operation":"add","operands":[1,"2"]}`, 400, CodeInvalidJSON},
		{"number overflowing float64", "application/json", `{"operation":"add","operands":[1e999,1]}`, 400, CodeInvalidJSON},
		{"malformed json", "application/json", `{"operation":`, 400, CodeInvalidJSON},
		{"empty body", "application/json", ``, 400, CodeInvalidJSON},
		{"unknown field", "application/json", `{"operation":"add","operands":[1,2],"x":1}`, 400, CodeInvalidJSON},
		{"trailing data", "application/json", `{"operation":"add","operands":[1,2]}{}`, 400, CodeInvalidJSON},
		{"wrong content type", "text/plain", `{"operation":"add","operands":[1,2]}`, 415, CodeUnsupportedMedia},
		{"missing content type", "", `{"operation":"add","operands":[1,2]}`, 415, CodeUnsupportedMedia},
		{"too large", "application/json", `{"operation":"add","operands":[` + strings.Repeat("1,", maxBodyBytes) + `1]}`, 413, CodePayloadTooLarge},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			rec := do(t, h, http.MethodPost, "/api/v1/calculate", tc.contentType, tc.body)
			if rec.Code != tc.wantStatus {
				t.Fatalf("status = %d, want %d; body = %s", rec.Code, tc.wantStatus, rec.Body)
			}
			var resp ErrorResponse
			if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
				t.Fatalf("invalid JSON error body: %v", err)
			}
			if resp.Error.Code != tc.wantCode {
				t.Fatalf("code = %q, want %q", resp.Error.Code, tc.wantCode)
			}
			if resp.Error.Message == "" {
				t.Fatal("error message is empty")
			}
		})
	}
}

func TestCalculate_ContentTypeWithCharsetAccepted(t *testing.T) {
	rec := do(t, newTestServer(t, ""), http.MethodPost, "/api/v1/calculate",
		"application/json; charset=utf-8", `{"operation":"add","operands":[1,2]}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
}

func TestUnknownOperationListsSupported(t *testing.T) {
	rec := do(t, newTestServer(t, ""), http.MethodPost, "/api/v1/calculate",
		"application/json", `{"operation":"modulo","operands":[1,2]}`)
	if !strings.Contains(rec.Body.String(), "supported operations: add") {
		t.Fatalf("message should list supported operations, got %s", rec.Body)
	}
}

func TestMethodNotAllowed(t *testing.T) {
	rec := do(t, newTestServer(t, ""), http.MethodGet, "/api/v1/calculate", "", "")
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want 405", rec.Code)
	}
}

func TestHealth(t *testing.T) {
	rec := do(t, newTestServer(t, ""), http.MethodGet, "/healthz", "", "")
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"ok"`) {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body)
	}
}

func TestCORS(t *testing.T) {
	const origin = "http://localhost:5173"
	h := newTestServer(t, origin)

	t.Run("preflight", func(t *testing.T) {
		rec := do(t, h, http.MethodOptions, "/api/v1/calculate", "", "")
		if rec.Code != http.StatusNoContent {
			t.Fatalf("status = %d, want 204", rec.Code)
		}
		if got := rec.Header().Get("Access-Control-Allow-Origin"); got != origin {
			t.Fatalf("allow-origin = %q", got)
		}
	})
	t.Run("actual request carries header", func(t *testing.T) {
		rec := do(t, h, http.MethodPost, "/api/v1/calculate", "application/json", `{"operation":"add","operands":[1,2]}`)
		if got := rec.Header().Get("Access-Control-Allow-Origin"); got != origin {
			t.Fatalf("allow-origin = %q", got)
		}
	})
	t.Run("disabled when origin empty", func(t *testing.T) {
		rec := do(t, newTestServer(t, ""), http.MethodPost, "/api/v1/calculate", "application/json", `{"operation":"add","operands":[1,2]}`)
		if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
			t.Fatalf("expected no CORS header, got %q", got)
		}
	})
}

func TestRecovererReturnsJSON500(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	h := recoverer(logger)(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		panic("boom")
	}))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec.Code != http.StatusInternalServerError || !strings.Contains(rec.Body.String(), CodeInternal) {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body)
	}
}

func TestMapErrorDefaultsTo500(t *testing.T) {
	if status, code := mapError(io.ErrUnexpectedEOF); status != 500 || code != CodeInternal {
		t.Fatalf("got %d %s", status, code)
	}
}
