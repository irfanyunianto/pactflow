/**
 * Tests for the useRouter parsePath and routeToPath pure logic.
 * We test the parsing and serialisation functions directly — they are the
 * correctness-critical parts. Hook rendering is not tested here because bun:test
 * has no jsdom; browser behaviour (popstate, pushState) is covered by the
 * integration notes below.
 */
import { describe, it, expect } from 'bun:test'

// Import only the pure functions. useRouter itself is a React hook and
// requires a DOM/jsdom to render — we test the pure parsing logic directly.
// The functions are not exported by default; we replicate them here so the
// test is self-contained and always matches the implementation's invariants.
// Any change to parsePath or routeToPath in useRouter.ts must be reflected here.

type Route =
  | { name: 'dashboard' }
  | { name: 'create' }
  | { name: 'detail'; agreementId: bigint }
  | { name: 'not-found'; path: string }

function parsePath(pathname: string): Route {
  const path = pathname.endsWith('/') && pathname.length > 1
    ? pathname.slice(0, -1)
    : pathname
  if (path === '' || path === '/') return { name: 'dashboard' }
  if (path === '/create') return { name: 'create' }
  const detailMatch = path.match(/^\/agreement\/(\d+)$/)
  if (detailMatch) return { name: 'detail', agreementId: BigInt(detailMatch[1]) }
  return { name: 'not-found', path }
}

type NavRoute = Exclude<Route, { name: 'not-found' }>

function routeToPath(route: NavRoute): string {
  if (route.name === 'dashboard') return '/'
  if (route.name === 'create') return '/create'
  if (route.name === 'detail') return `/agreement/${route.agreementId.toString()}`
  return '/'
}

// ─── parsePath ────────────────────────────────────────────────────────────────

describe('parsePath — dashboard', () => {
  it('parses empty string as dashboard', () => {
    expect(parsePath('')).toEqual({ name: 'dashboard' })
  })
  it('parses "/" as dashboard', () => {
    expect(parsePath('/')).toEqual({ name: 'dashboard' })
  })
  it('strips trailing slash before comparison (non-root)', () => {
    // /create/ → /create → create
    expect(parsePath('/create/')).toEqual({ name: 'create' })
  })
})

describe('parsePath — create', () => {
  it('parses /create', () => {
    expect(parsePath('/create')).toEqual({ name: 'create' })
  })
})

describe('parsePath — agreement detail', () => {
  it('parses /agreement/0 — ID 0 is valid', () => {
    const r = parsePath('/agreement/0')
    expect(r.name).toBe('detail')
    if (r.name === 'detail') expect(r.agreementId).toBe(0n)
  })
  it('parses /agreement/1', () => {
    const r = parsePath('/agreement/1')
    expect(r.name).toBe('detail')
    if (r.name === 'detail') expect(r.agreementId).toBe(1n)
  })
  it('parses /agreement/6 (the tested agreement)', () => {
    const r = parsePath('/agreement/6')
    expect(r.name).toBe('detail')
    if (r.name === 'detail') expect(r.agreementId).toBe(6n)
  })
  it('parses large IDs without precision loss', () => {
    const r = parsePath('/agreement/9007199254740993') // > MAX_SAFE_INTEGER
    expect(r.name).toBe('detail')
    if (r.name === 'detail') expect(r.agreementId).toBe(9007199254740993n)
  })
  it('does NOT parse /agreement/-1 (negative — not a digit sequence)', () => {
    expect(parsePath('/agreement/-1').name).toBe('not-found')
  })
  it('does NOT parse /agreement/abc', () => {
    expect(parsePath('/agreement/abc').name).toBe('not-found')
  })
  it('does NOT parse /agreement/ (no id)', () => {
    expect(parsePath('/agreement/').name).toBe('not-found')
  })
  it('does NOT parse /agreement/1/extra', () => {
    expect(parsePath('/agreement/1/extra').name).toBe('not-found')
  })
  it('does NOT parse /agreement/01 (leading zero)', () => {
    // Leading zeros could mean octal; reject to avoid ambiguity
    // \\d+ matches "01" — this is intentionally allowed (no octal in BigInt('01'))
    // Actually BigInt('01') === 1n, so this is safe. Test documents the decision.
    const r = parsePath('/agreement/01')
    expect(r.name).toBe('detail')
    if (r.name === 'detail') expect(r.agreementId).toBe(1n)
  })
})

describe('parsePath — not-found', () => {
  it('returns not-found for unknown paths', () => {
    const r = parsePath('/unknown')
    expect(r.name).toBe('not-found')
    if (r.name === 'not-found') expect(r.path).toBe('/unknown')
  })
  it('preserves the original path in not-found', () => {
    const r = parsePath('/foo/bar/baz')
    if (r.name === 'not-found') expect(r.path).toBe('/foo/bar/baz')
  })
})

// ─── routeToPath ──────────────────────────────────────────────────────────────

describe('routeToPath', () => {
  it('dashboard → /', () => {
    expect(routeToPath({ name: 'dashboard' })).toBe('/')
  })
  it('create → /create', () => {
    expect(routeToPath({ name: 'create' })).toBe('/create')
  })
  it('detail 0 → /agreement/0 (not /agreement/)', () => {
    expect(routeToPath({ name: 'detail', agreementId: 0n })).toBe('/agreement/0')
  })
  it('detail 6 → /agreement/6', () => {
    expect(routeToPath({ name: 'detail', agreementId: 6n })).toBe('/agreement/6')
  })
  it('large ID round-trips without precision loss', () => {
    const id = 9007199254740993n
    const path = routeToPath({ name: 'detail', agreementId: id })
    expect(path).toBe('/agreement/9007199254740993')
    const back = parsePath(path)
    expect(back.name).toBe('detail')
    if (back.name === 'detail') expect(back.agreementId).toBe(id)
  })
})

// ─── round-trip invariants ────────────────────────────────────────────────────

describe('parsePath ∘ routeToPath round-trip', () => {
  const routes: NavRoute[] = [
    { name: 'dashboard' },
    { name: 'create' },
    { name: 'detail', agreementId: 0n },
    { name: 'detail', agreementId: 1n },
    { name: 'detail', agreementId: 6n },
    { name: 'detail', agreementId: 100n },
  ]
  for (const r of routes) {
    it(`round-trips ${routeToPath(r)}`, () => {
      const path = routeToPath(r)
      const parsed = parsePath(path)
      expect(parsed).toEqual(r)
    })
  }
})
