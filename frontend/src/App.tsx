import { Calculator } from './components/Calculator.tsx'

export function App() {
  return (
    <main className="page">
      <h1 className="visually-hidden">Calculator</h1>
      <Calculator />
      <p className="page__hint">
        You can also type: digits, + − * / ^ %, R for √, Enter for =, Esc to clear.
      </p>
    </main>
  )
}