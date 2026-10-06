# Prompts

This project was built with **Claude** (Anthropic) in a single conversation, as the assignment allows.

The Full conversation can be found Here: https://claude.ai/share/717c9a61-907d-4ad9-8d19-67a9d05cd74d

## How AI was used

I asked Claude to plan the project and then deliver it **one file or change at a time**, explaining every decision. For each step I:

1. created the file myself,
2. ran the checks for that step (`gofmt`, `go vet`, `go test`, `npm run lint`, `npm run build`, `npm test`, manual testing with PowerShell and the browser),
3. reported the results or errors back, and
4. committed only after the step worked.

Claude also verified code in its own sandbox before giving it to me (type checks, tests, an nginx and Go end-to-end test). Several issues were found and fixed during this process; they are noted below.

The prompts are quoted exactly as written. Short messages used only to move to the next step (such as "its done", "continue", "we can move on to step 6") are omitted.

---

## 1. Planning

> hi i would like to complete a technical assignment. understand the assignment and give me a guideline. then start execution step by step

*(With a screenshot of the assignment.)* Claude summarized the requirements, proposed a plan (Go backend with a pure calculator package and a separate HTTP layer, React + TypeScript frontend, tests, Docker, README), and started on the backend.

> ok lets start with backend and continue after. Please explain everthing and give one change or file at a time to not lose control througout the journey

Set the working style for the rest of the project: one file per step, with a full explanation and a way to verify it before moving on.

## 2. Backend

> go tool cover -html=coverage.out gives PS D:\emir-\Desktop\calc\backend> go tool cover -html=coverage.out
> too many arguments

PowerShell splits arguments containing a dot. Fixed by quoting: `go tool cover "-html=coverage.out"`. Noted in the README.

> it prints this instead nothing [...] `gofmt -l .` lists every file

Windows line endings (CRLF). Led to `gofmt -w`, a `.gitattributes` file enforcing LF, and `git config core.autocrlf input`.

> {"level":"ERROR","msg":"server failed","error":"listen tcp :8080: bind: Only one usage of each socket address [...] is normally permitted."}

Another program was using port 8080. Showed the server's startup error handling working, and how to find the process or use the `PORT` variable.

> *(Output of the manual API tests in PowerShell, where `divide [5, 0]` printed an empty line.)*

A stale keep-alive connection in PowerShell, not a server bug (the server's idle timeout had closed it). Improved the test helper to report requests that get no response; the re-run returned the expected `422`.

> PS D:\emir-\Desktop\calc\backend> docker run --rm -v "${PWD}:/src" -w /src golang:1.27 go test -race ./...

Ran the race detector in Docker, since it needs cgo, which isn't available on Windows without a C compiler. All packages passed.

## 3. Frontend setup

> oxlint or eslint is better for this project

Chose Oxlint: Vite's default linter for React templates, fast, minimal configuration, and it enforces the rules of hooks.

> warning: in the working copy of 'frontend/.gitignore', LF will be replaced by CRLF the next time Git touches it [...]

Revealed that `.gitattributes` had been created in the wrong folder. Recreated it in the repo root and verified with `git check-attr`.

> i didnt fix that in step 5 will it be a problem

Checked with `git ls-files --eol`: the repository already stored LF everywhere. Also found and untracked a generated `backend/coverage` file that had been committed before `.gitignore` existed.

## 4. Frontend features

> *(Design proposal: a desk calculator with a paper tape.)* Looks good, build it

Approved the visual design before any styling code was written.

> calculations ake around a second is it normal

Diagnosed as slow `localhost` resolution in the Vite proxy on Windows (IPv6 attempted before IPv4). Fixed by targeting `127.0.0.1`.

> can we make calculator bigger in the desktop

Added height-aware breakpoints that scale the whole calculator (sized in `rem`) on larger screens, while always fitting without scrolling and respecting browser zoom and user font settings.

## 5. Tests

> coverage reprt is not looking good

*(With a screenshot of 19.58% coverage after the setup step.)* Expected at that point, with only a smoke test. The following steps added test files layer by layer, reaching 100% for every frontend source file. Writing them also revealed two real gaps (an untested action wiring and an unrealistic fake `fetch` that ignored cancellation), which were fixed.

> FAIL src/lib/calculatorReducer.test.ts [...] PARSE_ERROR Unexpected token

The test file had been cut off while pasting. Restored the missing end, and later files were written with shorter lines and a line count to check after pasting.

## 6. Docker

> it run after i launched backend we can continue

Confirmed that nginx starts without the backend and picks it up automatically once it runs, thanks to resolving the backend's address per request.

> *(Output of `docker compose up --build -d`, `docker compose ps`, `docker compose restart backend` and `docker compose down`.)* it was successful

Confirmed the full stack runs with one command, and that only the frontend publishes a port.
