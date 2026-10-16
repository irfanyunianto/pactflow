/**
 * Minimal browser-history router for PactFlow's three routes:
 *   /           → dashboard
 *   /create     → create agreement
 *   /agreement/:id  → agreement detail (id is a non-negative integer)
 *
 * The URL is the source of truth. pushRoute() updates both the URL and the
 * component that renders. popstate (Back/Forward) also updates the component.
 * ID 0 is a valid agreement ID — never treat it as falsy.
 */

import { useState, useEffect, useCallback } from 'react'

export type Route =
  | { name: 'dashboard' }
  | { name: 'create' }
  | { name: 'detail'; agreementId: bigint }
  | { name: 'not-found'; path: string }

/** Parse window.location.pathname into a Route. */
function parsePath(pathname: string): Route {
  // Normalise: strip trailing slash except root
  const path = pathname.endsWith('/') && pathname.length > 1
    ? pathname.slice(0, -1)
    : pathname

  if (path === '' || path === '/') return { name: 'dashboard' }
  if (path === '/create') return { name: 'create' }

  const detailMatch = path.match(/^\/agreement\/(\d+)$/)
  if (detailMatch) {
    // Use BigInt directly from the numeric string — no Number() intermediary
    // so IDs above Number.MAX_SAFE_INTEGER are handled correctly.
    return { name: 'detail', agreementId: BigInt(detailMatch[1]) }
  }

  return { name: 'not-found', path }
}

/** The subset of routes that can be navigated to programmatically. */
export type NavRoute =
  | { name: 'dashboard' }
  | { name: 'create' }
  | { name: 'detail'; agreementId: bigint }

/** Produce the canonical URL string for a navigable route. */
export function routeToPath(route: NavRoute): string {
  if (route.name === 'dashboard') return '/'
  if (route.name === 'create') return '/create'
  if (route.name === 'detail') return `/agreement/${route.agreementId.toString()}`
  return '/'
}

export interface UseRouterResult {
  route: Route
  pushRoute: (r: NavRoute) => void
  replaceRoute: (r: NavRoute) => void
}

export function useRouter(): UseRouterResult {
  const [route, setRoute] = useState<Route>(() =>
    parsePath(window.location.pathname)
  )

  // Sync with browser Back / Forward
  useEffect(() => {
    function onPopState() {
      setRoute(parsePath(window.location.pathname))
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const pushRoute = useCallback((r: NavRoute) => {
    const path = routeToPath(r)
    window.history.pushState(null, '', path)
    setRoute(r)
  }, [])

  const replaceRoute = useCallback((r: NavRoute) => {
    const path = routeToPath(r)
    window.history.replaceState(null, '', path)
    setRoute(r)
  }, [])

  return { route, pushRoute, replaceRoute }
}
