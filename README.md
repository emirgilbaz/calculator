# Calculator

A full-stack calculator: a **React + TypeScript** frontend that performs every calculation through a **Go** REST API.

The frontend never does arithmetic itself. It collects input, sends each operation to the backend, and displays the result or a clear error message.

```
browser ──► nginx (frontend container) ──► /api/* ──► Go backend (private network)
              └── serves the React app
```

## Contents

- [Quick start (Docker)](#quick-start-docker)
- [Running locally without Docker](#running-locally-without-docker)
- [Using the calculator](#using-the-calculator)
- [API](#api)
- [Tests and coverage](#tests-and-coverage)
- [Project structure](#project-structure)
- [Design decisions](#design-decisions)
- [Assumptions](#assumptions)
- [Possible improvements](#possible-improvements)
- [Notes for Windows](#notes-for-windows)
- [AI usage](#ai-usage)

---

## Quick start (Docker)

Requires only [Docker](https://docs.docker.com/get-docker/) with Compose.

```bash
docker compose up --build
```

Open **http://localhost:8080**.

If port 8080 is already in use, choose another one:

```bash
APP_PORT=8090 docker compose up --build        # macOS / Linux
$env:APP_PORT = "8090"; docker compose up --build   # Windows PowerShell
```

Stop with `Ctrl+C`, or run in the background with `-d` and stop with `docker compose down`.

Only the frontend container publishes a port. The backend is reachable only through nginx on the private Compose network.

---

## Running locally without Docker

### Prerequisites

| Tool | Version |
|---|---|
| Go | 1.27 or newer (see `backend/go.mod`) |
| Node.js | 22 or newer (developed with Node 24) |

### Backend

```bash
cd backend
go run ./cmd/server
```

The API listens on **http://localhost:8080**. Configuration is read from environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8080` | Port to listen on |
| `CORS_ALLOWED_ORIGIN` | `http://localhost:5173` | Origin allowed by CORS. Set it to an empty value to disable CORS. |

The server logs every request as JSON and shuts down gracefully on `Ctrl+C` / `SIGTERM`, letting in-flight requests finish.

### Frontend

In a second terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open **http://localhost:5173**. The Vite dev server proxies `/api/*` to the backend at `http://127.0.0.1:8080`. To point it at a backend on another port:

```bash
BACKEND_URL=http://127.0.0.1:8081 npm run dev              # macOS / Linux
$env:BACKEND_URL = "http://127.0.0.1:8081"; npm run dev    # Windows PowerShell
```

Other scripts:

| Command | What it does |
|---|---|
| `npm run build` | Type-checks (`tsc -b`) and builds the production bundle into `dist/` |
| `npm run lint` | Lints with [Oxlint](https://oxc.rs/docs/guide/usage/linter) |
| `npm test` | Runs all tests once |
| `npm run test:watch` | Re-runs tests on every change |
| `npm run coverage` | Runs tests with a coverage report |

---

## Using the calculator

Click the keys, or type on the keyboard:

| Key | Action |
|---|---|
| `0`–`9` | Digits |
| `.` or `,` | Decimal point (`,` supports numeric keypads on European layouts) |
| `+` `-` `*` `/` | Add, subtract, multiply, divide (`x` also multiplies) |
| `^` | Power, e.g. `2 ^ 10 =` → 1024 |
| `%` | Percent of, e.g. `20 % 150 =` → 30 |
| `R` | Square root of the displayed number (computed immediately) |
| `Enter` or `=` | Calculate |
| `Backspace` | Delete the last digit |
| `Escape` or `Delete` | Clear everything |

The strip above the display ("paper tape") shows the calculation in progress (`12 +`) or the one just completed (`12 + 3 =`). Errors such as division by zero appear below the display without losing the input, so the user can correct it and try again.

---

## API

The examples below work against the backend run locally (`go run`) **and** against the Docker setup, since both listen on `localhost:8080` and nginx forwards `/api/*` unchanged.

> **Windows PowerShell:** use `curl.exe` instead of `curl`, or `Invoke-WebRequest`. In Windows PowerShell 5.1, `curl` is an alias for `Invoke-WebRequest`.

### `POST /api/v1/calculate`

Request:

```json
{ "operation": "add", "operands": [2, 3] }
```

Successful response (`200 OK`):

```json
{ "operation": "add", "operands": [2, 3], "result": 5 }
```

| Operation | Operands | Result |
|---|---|---|
| `add` | `[a, b]` | a + b |
| `subtract` | `[a, b]` | a − b |
| `multiply` | `[a, b]` | a × b |
| `divide` | `[a, b]` | a ÷ b |
| `power` | `[a, b]` | a to the power b |
| `percentage` | `[a, b]` | a percent of b, e.g. `[20, 150]` → 30 |
| `sqrt` | `[a]` | square root of a |

### Errors

Every error uses the same envelope, with a stable machine-readable `code` and a human-readable `message`:

```json
{ "error": { "code": "DIVISION_BY_ZERO", "message": "division by zero" } }
```

| Status | Code | When |
|---|---|---|
| 400 | `INVALID_JSON` | Malformed JSON, wrong types, unknown fields, empty body, or trailing data |
| 400 | `UNKNOWN_OPERATION` | Operation not supported (the message lists the supported ones) |
| 400 | `INVALID_OPERAND_COUNT` | Wrong number of operands for the operation |
| 400 | `INVALID_OPERAND` | An operand is `null` |
| 413 | `PAYLOAD_TOO_LARGE` | Body larger than 1 MiB |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | `Content-Type` is not `application/json` |
| 422 | `DIVISION_BY_ZERO` | Divisor is 0 |
| 422 | `NEGATIVE_SQUARE_ROOT` | Square root of a negative number |
| 422 | `UNDEFINED_RESULT` | No real-number result, e.g. `(-8)^0.5` |
| 422 | `RESULT_OUT_OF_RANGE` | Result overflows a 64-bit float, e.g. `10^400` |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

`400` means the request itself is invalid; `422` means the request is valid but the math has no answer.

### Examples

```bash
curl -X POST http://localhost:8080/api/v1/calculate \
  -H "Content-Type: application/json" \
  -d '{"operation":"add","operands":[0.1,0.2]}'
# 200 {"operation":"add","operands":[0.1,0.2],"result":0.30000000000000004}

curl -X POST http://localhost:8080/api/v1/calculate \
  -H "Content-Type: application/json" \
  -d '{"operation":"sqrt","operands":[16]}'
# 200 {"operation":"sqrt","operands":[16],"result":4}

curl -X POST http://localhost:8080/api/v1/calculate \
  -H "Content-Type: application/json" \
  -d '{"operation":"divide","operands":[5,0]}'
# 422 {"error":{"code":"DIVISION_BY_ZERO","message":"division by zero"}}

curl -X POST http://localhost:8080/api/v1/calculate \
  -H "Content-Type: application/json" \
  -d '{"operation":"add","operands":[1,null]}'
# 400 {"error":{"code":"INVALID_OPERAND","message":"operand 1 must be a number, got null"}}

curl -X POST http://localhost:8080/api/v1/calculate \
  -H "Content-Type: application/json" \
  -d '{"operation":"modulo","operands":[5,2]}'
# 400 {"error":{"code":"UNKNOWN_OPERATION","message":"unknown operation: \"modulo\"; supported operations: add, divide, multiply, percentage, power, sqrt, subtract"}}
```

`0.30000000000000004` is the correct IEEE-754 result; the frontend displays it as `0.3` (see [Design decisions](#frontend)).

### `GET /healthz`

Returns `{"status":"ok"}`. Intended for orchestrators and load balancers. It is served by the backend directly (`go run`); in the Docker setup the backend is not exposed, and nginx only forwards `/api/*`.

---

## Tests and coverage

### Backend

```bash
cd backend
go test ./... -cover
```

| Package | Coverage |
|---|---|
| `internal/calculator` | 100% |
| `internal/api` | 98.9% |
| `cmd/server` | 0% (wiring only, see below) |

HTML report:

```bash
go test ./... -coverprofile=coverage.out
go tool cover -html=coverage.out
```

> **Windows PowerShell** splits arguments containing a dot, so quote them: `go test ./... "-coverprofile=coverage.out"` and `go tool cover "-html=coverage.out"`.

Race detector (needs cgo, so it runs in a Linux container on any OS):

```bash
docker run --rm -v "${PWD}:/src" -w /src golang:1.27 go test -race ./...
```

`cmd/server/main.go` only reads configuration, starts the server, and handles shutdown signals. All logic lives in the tested `internal` packages, which keeps the untestable surface as small as possible.

### Frontend

```bash
cd frontend
npm run coverage
```

160 tests across 6 files, with **100% statement, branch, function, and line coverage** for every source file. The HTML report is written to `frontend/coverage/index.html`.

| Test file | What it covers |
|---|---|
| `lib/format.test.ts` | Number display: float noise, significant digits, notation boundaries |
| `lib/calculatorReducer.test.ts` | All calculator behavior, written as key sequences like `'2 + 3 × 4 ='` |
| `api/client.test.ts` | Every response case: success, API errors, network failure, proxy errors, cancellation |
| `hooks/useCalculator.test.tsx` | Requests, friendly error messages, cancellation, StrictMode safety |
| `components/Calculator.test.tsx` | The UI as a user sees it: mouse, keyboard, errors, accessibility |
| `App.test.tsx` | Smoke test of the whole app |

`main.tsx` is excluded from coverage for the same reason as `main.go`.

---

## Project structure

```
.
├── compose.yaml                 # Runs frontend + backend together
├── backend/
│   ├── cmd/server/main.go       # Entry point: config, timeouts, graceful shutdown
│   ├── internal/calculator/     # Pure arithmetic and validation, no HTTP
│   ├── internal/api/            # HTTP layer: handler, middleware, JSON types
│   └── Dockerfile               # Multi-stage build → distroless, non-root
└── frontend/
    ├── src/
    │   ├── api/                 # API types and the only code that calls fetch
    │   ├── lib/                 # Pure logic: number formatting, calculator reducer
    │   ├── hooks/               # useCalculator: connects the reducer to React and the API
    │   ├── components/          # Calculator (container), Display and Keypad (presentational)
    │   └── styles.css
    ├── nginx.conf               # Serves the app, proxies /api, security headers
    └── Dockerfile               # Multi-stage build → unprivileged nginx
```

Both sides follow the same layering: pure logic at the core, I/O at the edges, and a thin entry point.

| Layer | Backend | Frontend |
|---|---|---|
| Pure logic | `internal/calculator` | `lib/calculatorReducer.ts`, `lib/format.ts` |
| I/O boundary | `internal/api` | `api/client.ts`, `hooks/useCalculator.ts` |
| Presentation | – | `components/` |
| Entry point | `cmd/server/main.go` | `main.tsx`, `App.tsx` |

---

## Design decisions

### Backend

**One endpoint with an operation registry.** `POST /api/v1/calculate` takes `{operation, operands}`. Operations live in a single registry map with their arity and implementation, so adding one is a one-line change and operand-count validation happens in one place. Operands are an array so unary and binary operations share one shape. The `v1` prefix leaves room for a future breaking change.

**Pure core, thin HTTP layer.** `internal/calculator` knows nothing about HTTP or JSON and returns sentinel errors. `internal/api` maps those errors to status codes with `errors.Is`, never by comparing strings.

**400 vs 422.** A malformed request is `400`; a well-formed request whose math has no answer (division by zero, overflow) is `422`. Clients can tell a client bug from a normal user-facing situation.

**Stable error codes.** Every error has a constant `code` that clients can switch on, plus a `message` for humans that can change freely.

**Strict input handling.** Unknown fields, trailing data, bodies over 1 MiB, and a missing or wrong `Content-Type` are rejected. Operands are decoded as `[]*float64` so that a JSON `null` is rejected instead of silently becoming `0` (otherwise `add(5, null)` would return a wrong answer with no error).

**No NaN or Infinity in responses.** JSON cannot represent them, so results like `(-8)^0.5` and `10^400` become `422` errors. Negative zero is normalized to `0`.

**Standard library only.** Go 1.22+ method-based routing (`"POST /api/v1/calculate"`) removed the need for a router library, so the backend has no third-party dependencies.

**Production basics.** Middleware recovers panics into JSON `500`s, logs every request as structured JSON (`log/slog`), and handles CORS for a single configured origin. The server sets read/write/idle timeouts (protecting against slow-client attacks), drains in-flight requests on `SIGTERM`, and runs in a distroless, non-root container.

### Frontend

**Layered like the backend.** Only `api/client.ts` calls `fetch`. It classifies every outcome (success, API error, unreachable backend, a proxy's non-JSON error page, cancellation) into one typed `CalculatorError`, validating responses at runtime because TypeScript types don't exist at runtime.

**A pure reducer decides; an effect performs.** `calculatorReducer` holds all calculator behavior. When a calculation is needed, it puts a description of it in state (`request`), and the `useCalculator` hook performs the API call in an effect. The behavior is therefore testable without React or a network, and the reducer stays pure under React StrictMode.

**Race conditions are prevented in three layers.** Requests are aborted with `AbortController` when cleared or unmounted, responses arriving after an abort are dropped, and the reducer ignores any response when no request is in flight. Input is paused for the few milliseconds a request is in flight.

**Rounding happens only for display.** The backend returns exact IEEE-754 results. The frontend shows 12 significant digits (`0.30000000000000004` → `0.3`) and switches to exponential notation outside 10⁻⁶ to 10¹², but always carries the exact value into the next calculation, so rounding errors never accumulate.

**Input validation by construction.** Numbers can only be built from valid keys: one decimal point, at most 15 digits (the precision of a 64-bit float, so no typed digit is silently lost). Domain rules such as division by zero are left to the backend, which remains the single source of truth.

**Non-destructive errors.** A failed calculation shows a friendly message (mapped from the error code; unknown codes fall back to the server's message) and keeps the input, so the user can fix it and retry.

**Accessibility.** Symbol keys have accessible names (`÷` is announced as "Divide"), the display is a polite live region, errors are an alert, focus is visible for keyboard users, motion respects `prefers-reduced-motion`, and keys are at least 48px tall. Clicking a key does not move focus, so pressing `Enter` afterwards means `=`; keyboard users who tab to a key can still press it with `Enter` or `Space`.

**Same origin everywhere.** The frontend always calls a relative `/api/...` URL. Vite proxies it in development and nginx in production, so no backend URL is baked into the build and CORS is not needed. The backend still supports CORS for hosting the frontend on a different domain.

**nginx resolves the backend per request.** Using a variable with Docker's DNS resolver lets nginx start before the backend and survive backend restarts without being restarted itself.

**Caching and security headers.** Hashed build assets are cached for a year; `index.html` is never cached, so deploys take effect immediately. A strict Content Security Policy is possible because the build has no inline scripts or styles and fonts are self-hosted (no requests to third-party servers).

**Tooling.** Vite, Vitest, React Testing Library, and Oxlint (Vite's default linter: fast and minimal configuration). Types mirroring the API contract are written by hand in `api/types.ts`; with seven operations, that's simpler than code generation. `Record<Operation, ...>` types make the compiler flag any operation missing an arity, symbol, or error message.

---

## Assumptions

- **Percentage means "a percent of b"**: `percentage(20, 150) = 30`, rather than a unary `a / 100`.
- **Operations are evaluated left to right, like a basic calculator**: `2 + 3 × 4 =` gives `20`, not `14`. Each step is a single API call; there is no expression parsing or operator precedence.
- **`.` is the decimal separator** regardless of the browser locale. The keyboard also accepts `,` as input for numeric keypads on European layouts.
- **Numbers are 64-bit floats** (IEEE-754) on both sides, so `0.1 + 0.2` is `0.30000000000000004` internally and displayed as `0.3`.
- **The backend is stateless** and calculations are not stored.

---

## Possible improvements

- A CI pipeline (for example GitHub Actions) running lint, tests, coverage, and the race detector on every push.
- End-to-end tests in a real browser (for example Playwright) against the Docker setup.
- An OpenAPI specification, generating the frontend types from it.
- A `GET /api/v1/operations` endpoint, so the frontend learns operations and arities from the backend instead of mirroring them.
- Pinning the nginx base image to an exact version or digest for fully reproducible builds.
- Expression input with operator precedence, and a calculation history.

---

## Notes for Windows

- The repository enforces LF line endings through `.gitattributes`, so `gofmt` and other tools behave the same on every OS.
- The Vite proxy targets `127.0.0.1` rather than `localhost`, avoiding a slow IPv6-then-IPv4 fallback in Node.js on Windows that added about a second to every request.

---

## AI usage

This project was built with the help of Claude (Anthropic), step by step, with each file reviewed, explained, and tested before being committed. The prompts used are listed in [PROMPTS.md](PROMPTS.md).
