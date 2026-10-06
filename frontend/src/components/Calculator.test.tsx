import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Operation } from '../api/types.ts'
import { Calculator } from './Calculator.tsx'

const RESULTS: Record<Operation, (a: number, b: number) => number> = {
  add: (a, b) => a + b,
  subtract: (a, b) => a - b,
  multiply: (a, b) => a * b,
  divide: (a, b) => a / b,
  power: (a, b) => a ** b,
  sqrt: (a) => Math.sqrt(a),
  percentage: (a, b) => (a / 100) * b,
}

/** A fake backend that follows the real API's contract. */
function fakeBackend() {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (_url, init) => {
      const { operation, operands } = JSON.parse(String(init?.body)) as {
        operation: Operation
        operands: number[]
      }
      const [a = 0, b = 0] = operands
      if (operation === 'divide' && b === 0) {
        const error = { code: 'DIVISION_BY_ZERO', message: 'division by zero' }
        return new Response(JSON.stringify({ error }), { status: 422 })
      }
      const result = RESULTS[operation](a, b)
      return new Response(JSON.stringify({ operation, operands, result }))
    }),
  )
}

function setup() {
  fakeBackend()
  const user = userEvent.setup()
  const view = render(<Calculator />)
  return { user, ...view }
}

const display = () => screen.getByRole('status')
const tape = () => screen.getByTestId('tape')
const key = (name: string) => screen.getByRole('button', { name })

/** Waits until the display shows exactly `text`. */
async function expectDisplay(text: string) {
  await waitFor(() => expect(display().textContent).toBe(text))
}

describe('Calculator', () => {
  it('starts at 0 with an empty tape and no error', () => {
    setup()

    expect(display()).toHaveTextContent('0')
    expect(tape()).toBeEmptyDOMElement()
    expect(screen.getByRole('alert')).toBeEmptyDOMElement()
  })

  describe('with the mouse', () => {
    it('calculates 12 + 3 = 15 and prints it on the tape', async () => {
      const { user } = setup()

      await user.click(key('1'))
      await user.click(key('2'))
      await user.click(key('Add'))
      expect(tape()).toHaveTextContent('12 +')

      await user.click(key('3'))
      await user.click(key('Equals'))

      await expectDisplay('15')
      expect(tape()).toHaveTextContent('12 + 3 =')
    })

    it('edits numbers with the decimal, sign and delete keys', async () => {
      const { user } = setup()

      for (const name of ['1', 'Decimal point', '5', 'Change sign', '7']) {
        await user.click(key(name))
      }
      expect(display().textContent).toBe('-1.57')

      await user.click(key('Delete last digit'))
      expect(display().textContent).toBe('-1.5')

      await user.click(key('Clear all'))
      expect(display().textContent).toBe('0')
    })

    it('computes a square root immediately', async () => {
      const { user } = setup()

      await user.click(key('9'))
      await user.click(key('Square root'))

      await expectDisplay('3')
      expect(tape()).toHaveTextContent('√9 =')
    })

    it.each([
      { keys: ['2', 'Power', '1', '0'], shows: '1024', tape: '2 ^ 10 =' },
      { keys: ['2', '0', 'Percent of', '5', '0'], shows: '10', tape: '20 % of 50 =' },
      { keys: ['8', 'Divide', '2'], shows: '4', tape: '8 ÷ 2 =' },
      { keys: ['8', 'Multiply', '2'], shows: '16', tape: '8 × 2 =' },
      { keys: ['8', 'Subtract', '2'], shows: '6', tape: '8 − 2 =' },
    ])('shows $tape $shows', async ({ keys, shows, tape: expected }) => {
      const { user } = setup()

      for (const name of [...keys, 'Equals']) {
        await user.click(key(name))
      }

      await expectDisplay(shows)
      expect(tape()).toHaveTextContent(expected)
    })

    it('does not move focus to clicked keys, so Enter still means =', async () => {
      const { user } = setup()

      await user.click(key('4'))
      expect(key('4')).not.toHaveFocus()

      await user.click(key('Add'))
      await user.click(key('2'))
      await user.keyboard('{Enter}')

      await expectDisplay('6')
    })
  })

  describe('with the keyboard', () => {
    it.each([
      { typed: '12+3{Enter}', shows: '15', why: 'Enter means =' },
      { typed: '10-4=', shows: '6', why: '= key' },
      { typed: '6*7{Enter}', shows: '42', why: '* multiplies' },
      { typed: '6x7{Enter}', shows: '42', why: 'x multiplies' },
      { typed: '10/4{Enter}', shows: '2.5', why: '/ divides' },
      { typed: '2^10{Enter}', shows: '1024', why: '^ is power' },
      { typed: '20%150{Enter}', shows: '30', why: '% is percent of' },
      { typed: '9r', shows: '3', why: 'r is square root' },
      { typed: '9R', shows: '3', why: 'R works too' },
      { typed: '1.5', shows: '1.5', why: '. is the decimal point' },
      { typed: '1,5', shows: '1.5', why: ', is the decimal point too' },
      { typed: '123{Backspace}', shows: '12', why: 'Backspace deletes' },
      { typed: '12+3{Escape}', shows: '0', why: 'Escape clears' },
      { typed: '12{Delete}', shows: '0', why: 'Delete clears' },
      { typed: '0.1+0.2{Enter}', shows: '0.3', why: 'results are formatted' },
    ])('$why: $typed → $shows', async ({ typed, shows }) => {
      const { user } = setup()

      await user.keyboard(typed)

      await expectDisplay(shows)
    })

    it.each([
      { pressed: '{Enter}', name: 'Enter' },
      { pressed: ' ', name: 'Space' },
    ])('lets $name press a key that has keyboard focus', async ({ pressed }) => {
      const { user } = setup()

      key('7').focus()
      await user.keyboard(pressed)

      expect(display().textContent).toBe('7')
    })

    it('ignores shortcuts with Ctrl, Alt or Meta', async () => {
      const { user } = setup()

      await user.keyboard('{Control>}5{/Control}{Alt>}6{/Alt}{Meta>}r{/Meta}')

      expect(display().textContent).toBe('0')
    })

    it('prevents the browser default only for keys it handles', () => {
      setup()

      // fireEvent returns false when the event's default was prevented.
      expect(fireEvent.keyDown(window, { key: '/' })).toBe(false)
      expect(fireEvent.keyDown(window, { key: 'Tab' })).toBe(true)
    })

    it('stops listening when removed from the page', () => {
      const { unmount } = setup()
      const removeListener = vi.spyOn(window, 'removeEventListener')

      unmount()

      expect(removeListener).toHaveBeenCalledWith('keydown', expect.any(Function))
    })
  })

  describe('errors', () => {
    it('announces a friendly error, keeps the input, and recovers', async () => {
      const { user } = setup()

      await user.keyboard('5/0{Enter}')

      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent("Can't divide by zero."),
      )
      expect(display().textContent).toBe('0')

      await user.keyboard('{Backspace}2{Enter}')

      await expectDisplay('2.5')
      expect(screen.getByRole('alert')).toBeEmptyDOMElement()
    })
  })

  describe('display', () => {
    it.each([
      { digits: 9, size: 'large' },
      { digits: 10, size: 'medium' },
      { digits: 13, size: 'medium' },
      { digits: 14, size: 'small' },
    ])('uses the $size size for $digits characters', async ({ digits, size }) => {
      const { user } = setup()

      await user.keyboard('9'.repeat(digits))

      expect(display()).toHaveAttribute('data-size', size)
    })

    it('marks the calculator busy while a request is in flight', async () => {
      let respond: (response: Response) => void = () => {}
      vi.stubGlobal(
        'fetch',
        vi.fn<typeof fetch>(
          () =>
            new Promise<Response>((resolve) => {
              respond = resolve
            }),
        ),
      )
      const user = userEvent.setup()
      render(<Calculator />)
      const region = screen.getByRole('region', { name: 'Calculator' })

      await user.keyboard('1+2{Enter}')
      expect(region).toHaveAttribute('aria-busy', 'true')

      respond(new Response(JSON.stringify({ result: 3 })))
      await expectDisplay('3')
      expect(region).toHaveAttribute('aria-busy', 'false')
    })
  })

  describe('accessibility', () => {
    it.each([
      'Clear all',
      'Delete last digit',
      'Change sign',
      'Divide',
      'Power',
      'Percent of',
      'Square root',
      'Multiply',
      'Subtract',
      'Add',
      'Equals',
      'Decimal point',
      ...'0123456789',
    ])('has a key named "%s"', (name) => {
      setup()

      expect(key(name)).toHaveAttribute('type', 'button')
    })

    it('names the calculator region and announces the display politely', () => {
      setup()

      expect(screen.getByRole('region', { name: 'Calculator' })).toBeInTheDocument()
      expect(display()).toHaveAttribute('aria-live', 'polite')
    })
  })
})