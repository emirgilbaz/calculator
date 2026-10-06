import { describe, expect, it, vi } from 'vitest'
import { calculate, CalculatorError } from './client.ts'
import type { CalculateRequest } from './types.ts'

const request: CalculateRequest = { operation: 'add', operands: [2, 3] }

/** Replaces fetch with a fake that answers with the given status and body. */
function respondWith(status: number, body: unknown) {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  const fetchMock = vi.fn<typeof fetch>(async () => new Response(text, { status }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** Replaces fetch with a fake that fails before any response arrives. */
function failWith(error: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async () => {
      throw error
    }),
  )
}

describe('calculate', () => {
  it('returns the result on success', async () => {
    respondWith(200, { operation: 'add', operands: [2, 3], result: 5 })

    await expect(calculate(request)).resolves.toEqual({
      operation: 'add',
      operands: [2, 3],
      result: 5,
    })
  })

  it('sends a JSON POST to the calculate endpoint', async () => {
    const fetchMock = respondWith(200, { result: 5 })
    const { signal } = new AbortController()

    await calculate(request, signal)

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"operation":"add","operands":[2,3]}',
      signal,
    })
  })

  it('turns an API error into a CalculatorError with its code and status', async () => {
    respondWith(422, {
      error: { code: 'DIVISION_BY_ZERO', message: 'division by zero' },
    })

    const promise = calculate({ operation: 'divide', operands: [1, 0] })

    await expect(promise).rejects.toBeInstanceOf(CalculatorError)
    await expect(promise).rejects.toMatchObject({
      name: 'CalculatorError',
      code: 'DIVISION_BY_ZERO',
      message: 'division by zero',
      status: 422,
    })
  })

  it('passes through error codes it does not know yet', async () => {
    respondWith(429, { error: { code: 'RATE_LIMITED', message: 'slow down' } })

    await expect(calculate(request)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      message: 'slow down',
    })
  })

  it('reports SERVICE_UNAVAILABLE when the backend cannot be reached', async () => {
    failWith(new TypeError('Failed to fetch'))

    await expect(calculate(request)).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      status: undefined,
    })
  })

  it('rethrows the original error when the request was cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    const abortError = new DOMException('Aborted', 'AbortError')
    failWith(abortError)

    await expect(calculate(request, controller.signal)).rejects.toBe(abortError)
  })

  it.each([
    {
      status: 502,
      body: '<html>Bad Gateway</html>',
      code: 'SERVICE_UNAVAILABLE',
      why: 'a proxy error page (5xx, not JSON)',
    },
    {
      status: 500,
      body: '',
      code: 'SERVICE_UNAVAILABLE',
      why: 'an empty 5xx response',
    },
    {
      status: 404,
      body: '<html>Not Found</html>',
      code: 'UNEXPECTED_RESPONSE',
      why: 'a 4xx that is not our JSON',
    },
    {
      status: 200,
      body: { answer: 5 },
      code: 'UNEXPECTED_RESPONSE',
      why: 'a 200 without a numeric result',
    },
    {
      status: 200,
      body: { result: '5' },
      code: 'UNEXPECTED_RESPONSE',
      why: 'a 200 whose result is a string',
    },
    {
      status: 400,
      body: { error: 'bad request' },
      code: 'UNEXPECTED_RESPONSE',
      why: 'an error body without our envelope',
    },
    {
      status: 400,
      body: { error: { code: 'INVALID_JSON' } },
      code: 'UNEXPECTED_RESPONSE',
      why: 'an error envelope without a message',
    },
    {
      status: 200,
      body: null,
      code: 'UNEXPECTED_RESPONSE',
      why: 'a JSON null body',
    },
  ])('classifies $why as $code', async ({ status, body, code }) => {
    respondWith(status, body)

    await expect(calculate(request)).rejects.toMatchObject({ code, status })
  })
})

describe('CalculatorError', () => {
  it('is a real Error with a code and optional status', () => {
    const error = new CalculatorError('SERVICE_UNAVAILABLE', 'down')

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('CalculatorError')
    expect(error.message).toBe('down')
    expect(error.code).toBe('SERVICE_UNAVAILABLE')
    expect(error.status).toBeUndefined()
  })
})