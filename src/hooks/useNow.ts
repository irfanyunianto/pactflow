/**
 * useNow — returns the current Unix timestamp in seconds, updated every minute.
 *
 * Provides a live clock for deadline and dispute-window eligibility checks.
 * Cleans up its setInterval on unmount, preventing memory leaks and stale
 * state updates on unmounted components.
 *
 * Update interval: 60 seconds. This means eligibility transitions are detected
 * within 60 seconds of a deadline passing — sufficient for UX purposes.
 */
import { useState, useEffect } from 'react'

export function useNow(intervalMs = 60_000): number {
  const [nowTs, setNowTs] = useState(() => Math.floor(Date.now() / 1000))

  useEffect(() => {
    const id = setInterval(() => {
      setNowTs(Math.floor(Date.now() / 1000))
    }, intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  return nowTs
}
