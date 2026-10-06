import { act, renderHook, waitFor } from '@testing-library/react'
import { StrictMode, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { calculate } from '../api/client.ts'
import { useCalculator } from './useCalculator.ts'

// Keep the real client, but wrap it in a mock so one test can make it
// throw something unexpected.
vi.mock('../api/client.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client.ts')>()
  return { ...actual, calculate: vi.fn(actual.calculate) }
})

/** Render inside StrictMode, like the real app, to catch effect bugs. */
function renderCalculator() {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <StrictMode>{children}</StrictMode>
  )
  return renderHook(() => useCalculator(), { wrapper })
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status })
}

/** A fake backend that answers every request with the same response. */
function backendReturns(status: number, body: unknown) {
  const fetchMock = vi.fn<typeof fetch>(async () => json(status, body))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/**
 * A fake backend that never answers until the test calls `respond`.
 * With honorsAbort, it rejects on abort the way a real browser's fetch does.
 */
function slowBackend({ honorsAbort = false } = {}) {
  let respond: (response: Response) => void = () => {}
  let signal: AbortSignal | undefined
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>((_url, init) => {
      signal = init?.signal ?? undefined
      return new Promise<Response>((resolve, reject) => {
        respond = resolve
        if (honorsAbort) {
          signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        }
      })
    }),
  )
  return {
    respond: (response: Response) => respond(response),
    wasAborted: () => signal?.aborted,
  }
}

type Calc = ReturnType<typeof useCalculator>

/** Enter 12 + 3 = through the hook's actions. */
function enterTwelvePlusThree(calc: Calc) {
  calc.inputDigit('1')
  calc.inputDigit('2')
  calc.chooseOperation('add')
  calc.inputDigit('3')
  calc.equals()
}

describe('useCalculator', () => {
  it('starts with an empty display', () => {
    const { result } = renderCalculator()

    expect(result.current.display).toBe('0')
    expect(result.current.isLoading).toBe(false)
    expect(result.current.errorMessage).toBeNull()
  })

  it('sends the calculation to the API and shows the result', async () => {
    const fetchMock = backendReturns(200, { result: 15 })
    const { result } = renderCalculator()

    act(() => enterTwelvePlusThree(result.current))
    expect(result.current.isLoading).toBe(true)

    await waitFor(() => expect(result.current.display).toBe('15'))
    expect(result.current.isLoading).toBe(false)
    expect(result.current.lastCalculation).toEqual({
      operation: 'add',
      operands: [12, 3],
    })

    // Exactly one request, even though StrictMode runs effects twice.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = fetchMock.mock.calls[0]?.[1]?.body
    expect(JSON.parse(String(body))).toEqual({ operation: 'add', operands: [12, 3] })
  })

  it('wires every editing action to the reducer', () => {
    const { result } = renderCalculator()

    act(() => {
      result.current.inputDigit('1')
      result.current.inputDecimal()
      result.current.inputDigit('5')
      result.current.toggleSign()
    })
    expect(result.current.display).toBe('-1.5')

    act(() => result.current.backspace())
    expect(result.current.display).toBe('-1.')

    act(() => result.current.clear())
    expect(result.current.display).toBe('0')
  })

  it('exposes the pending operation for the tape', () => {
    const { result } = renderCalculator()

    act(() => {
      result.current.inputDigit('7')
      result.current.chooseOperation('multiply')
    })

    expect(result.current.pending).toEqual({ left: 7, operation: 'multiply' })
  })

  it.each([
    { code: 'DIVISION_BY_ZERO', shows: "Can't divide by zero." },
    {
      code: 'NEGATIVE_SQUARE_ROOT',
      shows: "Can't take the square root of a negative number.",
    },
    { code: 'RESULT_OUT_OF_RANGE', shows: 'The result is too large to calculate.' },
    { code: 'INVALID_JSON', shows: 'Something went wrong. Try again.' },
    { code: 'SOME_FUTURE_CODE', shows: 'message from the server' },
  ])('shows a friendly message for $code', async ({ code, shows }) => {
    backendReturns(422, { error: { code, message: 'message from the server' } })
    const { result } = renderCalculator()

    act(() => enterTwelvePlusThree(result.current))

    await waitFor(() => expect(result.current.errorMessage).toBe(shows))
    expect(result.current.isLoading).toBe(false)
  })

  it('explains when the backend cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    const { result } = renderCalculator()

    act(() => enterTwelvePlusThree(result.current))

    await waitFor(() =>
      expect(result.current.errorMessage).toBe(
        "Can't reach the calculator service. Check that the backend is running.",
      ),
    )
  })

  it('handles an unexpected error from the client', async () => {
    vi.mocked(calculate).mockRejectedValueOnce(new Error('boom'))
    const { result } = renderCalculator()

    act(() => enterTwelvePlusThree(result.current))

    await waitFor(() =>
      expect(result.current.errorMessage).toBe('Something went wrong. Try again.'),
    )
  })

  it('clears the error when the user types again', async () => {
    backendReturns(422, {
      error: { code: 'DIVISION_BY_ZERO', message: 'division by zero' },
    })
    const { result } = renderCalculator()

    act(() => enterTwelvePlusThree(result.current))
    await waitFor(() => expect(result.current.errorMessage).not.toBeNull())

    act(() => result.current.backspace())
    expect(result.current.errorMessage).toBeNull()
  })

  it('does not report a cancelled request as an error', async () => {
    slowBackend({ honorsAbort: true })
    const { result } = renderCalculator()

    act(() => enterTwelvePlusThree(result.current))
    await act(async () => result.current.clear())

    expect(result.current.errorMessage).toBeNull()
    expect(result.current.display).toBe('0')
  })

  it('ignores a response that arrives just after AC', async () => {
    const backend = slowBackend()
    const { result } = renderCalculator()

    act(() => enterTwelvePlusThree(result.current))
    expect(result.current.isLoading).toBe(true)

    act(() => result.current.clear())
    expect(backend.wasAborted()).toBe(true)

    await act(async () => backend.respond(json(200, { result: 15 })))
    expect(result.current.display).toBe('0')
    expect(result.current.isLoading).toBe(false)
  })

  it('aborts an in-flight request when the component unmounts', () => {
    const backend = slowBackend()
    const { result, unmount } = renderCalculator()

    act(() => enterTwelvePlusThree(result.current))
    unmount()

    expect(backend.wasAborted()).toBe(true)
  })

  it('keeps the same action functions across renders', () => {
    const { result } = renderCalculator()
    const first = result.current

    act(() => result.current.inputDigit('4'))

    expect(result.current.display).toBe('4')
    expect(result.current.inputDigit).toBe(first.inputDigit)
    expect(result.current.equals).toBe(first.equals)
  })
})