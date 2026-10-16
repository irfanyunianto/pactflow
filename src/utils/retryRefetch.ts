// Pure retry-with-postcondition loop used by useRefetchGroup.
// Extracted so it can be unit-tested without React or wagmi.
//
// SyncResult values:
//   'fresh'     — postcondition returned true before maxAttempts was exhausted.
//                 Data is confirmed fresh for the issued transaction.
//   'exhausted' — all maxAttempts fired but postcondition never passed.
//                 Callers should show "Transaction confirmed; balances not yet updated"
//                 with a working Retry button.
//   'cancelled' — the AbortSignal fired (unmount, wallet change, agreement change,
//                 or a newer sync superseded this one). Callers must NOT update
//                 isSyncing / SyncState — doing so would clobber the newer sync's state.
export type SyncResult = 'fresh' | 'exhausted' | 'cancelled'
export type RefetchFn  = () => Promise<unknown>

// Called after each set of refetches resolves. Return true when the
// on-chain state reflects the just-confirmed transaction.
// Return undefined (or omit) for a "fire-and-forget" sync with no
// postcondition — treated as never-fresh (will always exhaust unless
// you only need N fire-and-forget attempts, in which case use maxAttempts=1).
export type PostconditionFn = () => boolean

export interface RetryOptions {
  maxAttempts?:  number           // default 4
  intervalMs?:   number           // default 1500
  check?:        PostconditionFn  // postcondition checked after every attempt
}

/**
 * Fires all `refetches` concurrently, checks `check()` after each attempt.
 * Returns:
 *   'fresh'     — check() returned true before maxAttempts exhausted.
 *   'exhausted' — check() never returned true after maxAttempts attempts.
 *   'cancelled' — signal.aborted fired before completion.
 *
 * Each attempt awaits Promise.allSettled so individual rejected refetches
 * do not prevent the postcondition from being checked. A refetch that throws
 * synchronously is caught and treated as a rejected promise.
 *
 * Timing guarantee: the interval timer is only started after the slowest
 * refetch in the current attempt resolves (or rejects). If a refetch hangs
 * indefinitely it will block that attempt, so callers should time-box their
 * refetch functions if needed.
 */
export function retryRefetch(
  refetches: RefetchFn[],
  signal: AbortSignal,
  options: RetryOptions = {},
): Promise<SyncResult> {
  const { maxAttempts = 4, intervalMs = 1500, check } = options

  return new Promise<SyncResult>(resolve => {
    if (signal.aborted) { resolve('cancelled'); return }

    let attempt  = 0
    let resolved = false
    let timerId: ReturnType<typeof setTimeout> | undefined

    function finish(result: SyncResult) {
      if (resolved) return
      resolved = true
      signal.removeEventListener('abort', onAbort)
      if (timerId !== undefined) { clearTimeout(timerId); timerId = undefined }
      resolve(result)
    }

    const onAbort = () => finish('cancelled')
    signal.addEventListener('abort', onAbort, { once: true })

    function runAttempt() {
      if (signal.aborted) return   // onAbort has already called finish()

      attempt++
      const safeRefetches = refetches.map(fn => {
        try { return fn() } catch { return Promise.resolve() }
      })

      void Promise.allSettled(safeRefetches).then(() => {
        if (signal.aborted) return   // onAbort fired while allSettled was running

        // Check postcondition after reads have had a chance to update.
        if (check && check()) {
          finish('fresh')
          return
        }

        if (attempt >= maxAttempts) {
          finish('exhausted')
          return
        }

        timerId = setTimeout(() => {
          timerId = undefined
          runAttempt()
        }, intervalMs)
      })
    }

    runAttempt()
  })
}
