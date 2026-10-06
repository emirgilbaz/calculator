import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from './App.tsx'

describe('App', () => {
  it('renders the calculator with an empty display', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Calculator' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Calculator' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('0')
  })
})