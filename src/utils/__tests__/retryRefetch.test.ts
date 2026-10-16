/**
 * Unit tests for retryRefetch — the pure retry-with-postcondition loop.
 *
 * Uses bun:test with real async + intervalMs=0 so setTimeout fires on the
 * next event-loop tick without needing fake timers.
 *
 * Critical correctness invariants tested:
 *  - Failed/rejected reads must NOT satisfy a postcondition whose check reads
 *    undefined fields (the zero-default false-positive bug).
 *  - Reads that succeed but return stale data (postcondition = false) must not
 *    report 'fresh'.
 *  - Retry must reuse the same postcondition as the original sync (tested via
 *    the two-phase pattern: first call exhausts, second call with same check
 *    returns fresh when data finally arrives).
 *  - A missing/undefined claim value must not satisfy the claim postcondition.
 */

import { describe, test, expect, mock } from 'bun:test'
import { retryRefetch } from '../retryRefetch'

// Real async tick so intervalMs=0 timers fire.
const tick = (ms = 0) => new Promise<void>(r => setTimeout(r, ms))

describe('retryRefetch', () => {

  // ── 1. fresh on attempt 1 ────────────────────────────────────────────────
  test('1. returns fresh when postcondition passes on first attempt', async () => {
    const fn = mock(() => Promise.resolve())
    const ctrl = new AbortController()

    const result = await retryRefetch([fn], ctrl.signal, {
      maxAttempts: 4, intervalMs: 0,
      check: () => true,
    })

    expect(result).toBe('fresh')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  // ── 2. fresh on attempt 3 — stale on attempts 1-2 ────────────────────────
  test('2. returns fresh when postcondition passes on attempt 3 (stale on 1-2)', async () => {
    let checkCalls = 0
    const fn = mock(() => Promise.resolve())
    const ctrl = new AbortController()

    const check = () => { checkCalls++; return checkCalls >= 3 }

    const result = await retryRefetch([fn], ctrl.signal, {
      maxAttempts: 4, intervalMs: 0, check,
    })

    expect(result).toBe('fresh')
    expect(fn).toHaveBeenCalledTimes(3)
    expect(checkCalls).toBe(3)
  })

  // ── 3. exhausted — reads succeed but postcondition never passes ───────────
  // The key case: allSettled resolves on every attempt but data is still stale.
  // Must return 'exhausted', not 'fresh'.
  test('3. returns exhausted when reads succeed but postcondition never passes (stale RPC)', async () => {
    const fn = mock(() => Promise.resolve())
    const ctrl = new AbortController()

    // Simulates stale RPC: reads return successfully but value hasn't changed
    const check = () => false

    const result = await retryRefetch([fn], ctrl.signal, {
      maxAttempts: 3, intervalMs: 0, check,
    })

    expect(result).toBe('exhausted')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  // ── 4. reads fail AND postcondition reads undefined — must NOT return fresh ─
  // This replaces the previous test that accepted rejected reads as fresh when
  // check() returned true. The scenario being guarded: a claim postcondition
  // checks `pendingWithdraw !== undefined && pendingWithdraw === 0n`. If the
  // refetch fails, pendingWithdraw stays undefined — the check must return false.
  // We simulate this with a shared resultsRef that the refetch wrapper populates.
  test('4. returns exhausted when reads fail and postcondition requires defined data', async () => {
    // Simulate a refetch that fails and leaves its field undefined.
    const resultsRef = { pendingWithdraw: undefined as bigint | undefined }

    const fn = mock((): Promise<unknown> => {
      // Refetch fails — resultsRef.pendingWithdraw stays undefined
      return Promise.reject(new Error('RPC error'))
    })

    const ctrl = new AbortController()

    // Claim postcondition: requires defined AND === 0n (not undefined defaulted to 0)
    const check = () =>
      resultsRef.pendingWithdraw !== undefined && resultsRef.pendingWithdraw === 0n

    const result = await retryRefetch([fn], ctrl.signal, {
      maxAttempts: 2, intervalMs: 0, check,
    })

    // Failed read leaves pendingWithdraw undefined → check() returns false → exhausted
    expect(result).toBe('exhausted')
    expect(resultsRef.pendingWithdraw).toBeUndefined()
  })

  // ── 5. reads fail but postcondition passes from prior cached value ────────
  // allSettled catches rejections; if check() still passes (from a different
  // source), fresh is valid. This is not a bug — the postcondition decides.
  test('5. returns fresh when reads fail but postcondition passes from independent state', async () => {
    // The check reads from a value that was set by a different path (e.g. the
    // tx receipt itself set isFunded via an optimistic update elsewhere).
    let externalState = false

    const fn = mock((): Promise<unknown> => {
      // Refetch fails, but the external state was set by the tx receipt handler
      externalState = true  // simulates receipt-based optimistic update
      return Promise.reject(new Error('RPC error'))
    })

    const ctrl = new AbortController()
    const check = () => externalState   // reads external state, not the failed refetch

    const result = await retryRefetch([fn], ctrl.signal, {
      maxAttempts: 4, intervalMs: 0, check,
    })

    expect(result).toBe('fresh')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  // ── 6. missing claim data — undefined must not satisfy claim check ─────────
  // The exact production scenario: claim tx confirms, pendingWithdraw read fails,
  // resultsRef.pendingWithdraw stays undefined. The check must return false.
  // Without the undefined guard, `undefined === 0n` is false (JavaScript
  // coercion), but `!undefined` is truthy — different expressions have different
  // risks. This test locks in the correct `!== undefined &&` guard pattern.
  test('6. missing claim data: undefined pendingWithdraw does not satisfy claim check', async () => {
    const resultsRef = { pendingWithdraw: undefined as bigint | undefined }

    // Refetch sets pendingWithdraw only on success; stays undefined on failure
    const fn = mock((): Promise<unknown> => Promise.resolve())
    // Note: fn resolves but does NOT write to resultsRef (simulates a successful
    // HTTP call that returned empty/malformed data — .data is not a bigint).

    const ctrl = new AbortController()

    // The guarded claim check — undefined must fail
    const guardedCheck = () =>
      resultsRef.pendingWithdraw !== undefined && resultsRef.pendingWithdraw === 0n

    // The unguarded check — this is the BUG we are preventing
    const unguardedCheck = () => resultsRef.pendingWithdraw === 0n

    // Guarded: undefined !== undefined is false → returns exhausted
    const r1 = await retryRefetch([fn], new AbortController().signal, {
      maxAttempts: 1, intervalMs: 0, check: guardedCheck,
    })
    expect(r1).toBe('exhausted')
    expect(resultsRef.pendingWithdraw).toBeUndefined()

    // Unguarded: undefined === 0n is false in JS (not a false positive here,
    // but this test documents the correct check pattern)
    const r2 = await retryRefetch([fn], new AbortController().signal, {
      maxAttempts: 1, intervalMs: 0, check: unguardedCheck,
    })
    // undefined === 0n is false in JS strict equality — also exhausted
    expect(r2).toBe('exhausted')
  })

  // ── 7. cancellation mid-flight ────────────────────────────────────────────
  test('7. returns cancelled when signal is aborted mid-flight', async () => {
    let callCount = 0
    const ctrl = new AbortController()

    const fn = mock(() => {
      callCount++
      Promise.resolve().then(() => ctrl.abort())
      return Promise.resolve()
    })

    const result = await retryRefetch([fn], ctrl.signal, {
      maxAttempts: 4, intervalMs: 0,
      check: () => false,
    })

    expect(result).toBe('cancelled')
    expect(callCount).toBe(1)
  })

  // ── 8. pre-aborted signal ─────────────────────────────────────────────────
  test('8. returns cancelled immediately without calling refetch when pre-aborted', async () => {
    const fn = mock(() => Promise.resolve())
    const ctrl = new AbortController()
    ctrl.abort()

    const result = await retryRefetch([fn], ctrl.signal, {
      maxAttempts: 4, intervalMs: 0, check: () => true,
    })

    expect(result).toBe('cancelled')
    expect(fn).not.toHaveBeenCalled()
  })

  // ── 9. wallet change — abort before second attempt ────────────────────────
  test('9. returns cancelled and does not fire attempt 2 when aborted between attempts', async () => {
    let callCount = 0
    const ctrl = new AbortController()

    const fn = mock(async () => { callCount++ })

    const p = retryRefetch([fn], ctrl.signal, {
      maxAttempts: 4, intervalMs: 10,
      check: () => false,
    })

    await tick(5)
    ctrl.abort()

    const result = await p
    expect(result).toBe('cancelled')
    expect(callCount).toBe(1)
  })

  // ── 10. no postcondition — always exhausted ───────────────────────────────
  test('10. without check, always returns exhausted after maxAttempts', async () => {
    const fn = mock(() => Promise.resolve())
    const ctrl = new AbortController()

    const result = await retryRefetch([fn], ctrl.signal, {
      maxAttempts: 3, intervalMs: 0,
    })

    expect(result).toBe('exhausted')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  // ── 11. Retry with persistently stale data ────────────────────────────────
  // Simulates: tx confirmed, first sync exhausted (data stale), user presses
  // Retry, data is STILL stale — must return exhausted again (not fresh).
  // This verifies the postcondition is re-evaluated on Retry, not bypassed.
  test('11. Retry with persistently stale data still returns exhausted', async () => {
    const resultsRef = { isFunded: false }

    // Refetch always succeeds but data never changes (still not funded)
    const fn = mock((): Promise<unknown> => Promise.resolve())

    const check = () => resultsRef.isFunded === true

    // First sync — exhausted
    const r1 = await retryRefetch([fn], new AbortController().signal, {
      maxAttempts: 2, intervalMs: 0, check,
    })
    expect(r1).toBe('exhausted')

    // Retry — same check, same stale data — must still be exhausted
    const r2 = await retryRefetch([fn], new AbortController().signal, {
      maxAttempts: 2, intervalMs: 0, check,
    })
    expect(r2).toBe('exhausted')

    // fn fired 4 times total (2 attempts × 2 calls)
    expect(fn).toHaveBeenCalledTimes(4)
  })

  // ── 12. Retry succeeds when data finally arrives ───────────────────────────
  // Simulates: first sync exhausted, RPC catches up, Retry returns fresh.
  // Verifies that the stored currentCheckRef postcondition works across calls.
  test('12. Retry returns fresh when data arrives after initial exhaustion', async () => {
    const resultsRef = { isFunded: false }
    let syncCount = 0

    const fn = mock((): Promise<unknown> => {
      syncCount++
      // Data arrives on the 3rd call (i.e. first attempt of the Retry)
      if (syncCount >= 3) resultsRef.isFunded = true
      return Promise.resolve()
    })

    const check = () => resultsRef.isFunded === true

    // First sync (2 attempts) — exhausted (data still false)
    const r1 = await retryRefetch([fn], new AbortController().signal, {
      maxAttempts: 2, intervalMs: 0, check,
    })
    expect(r1).toBe('exhausted')

    // Retry (same check) — data arrives on first attempt → fresh
    const r2 = await retryRefetch([fn], new AbortController().signal, {
      maxAttempts: 2, intervalMs: 0, check,
    })
    expect(r2).toBe('fresh')
    expect(fn).toHaveBeenCalledTimes(3)  // 2 + 1 (early exit on fresh)
  })

  // ── 13. concurrent calls — second supersedes first ───────────────────────
  test('13. a second retryRefetch call (new AbortController) correctly supersedes the first', async () => {
    const ctrl1 = new AbortController()
    const ctrl2 = new AbortController()
    let calls1 = 0, calls2 = 0

    const fn1 = mock(async () => { calls1++ })
    const fn2 = mock(async () => { calls2++ })

    const p1 = retryRefetch([fn1], ctrl1.signal, {
      maxAttempts: 4, intervalMs: 20,
      check: () => false,
    })

    await tick(5)
    ctrl1.abort()

    const p2 = retryRefetch([fn2], ctrl2.signal, {
      maxAttempts: 2, intervalMs: 0,
      check: () => true,
    })

    const [r1, r2] = await Promise.all([p1, p2])

    expect(r1).toBe('cancelled')
    expect(r2).toBe('fresh')
    expect(calls1).toBe(1)
    expect(calls2).toBe(1)
  })

})

// ── Regression: milestone submit postcondition uses resultsRef, not React state ──
//
// BACKGROUND (agreement #6 bug):
//   The original MilestoneRow.handleTxSuccess closed over `milestoneRaw`
//   (a React state variable) in the postcondition check. `milestoneRaw` is
//   only updated by React after the next render commit — but retryRefetch's
//   check() fires in a Promise.allSettled microtask, BEFORE that commit.
//   So check() always saw the pre-tx status and returned false, causing
//   'exhausted' even when the milestone was correctly updated on-chain.
//
//   The fix: wrap refetchMilestone so it writes its result into a ref
//   (milestoneResultRef) synchronously inside the refetch Promise handler.
//   check() reads from that ref, not from React state.
//
// This test verifies the corrected pattern: the wrapped refetch updates
// the results ref, and the postcondition reads from the ref, so 'fresh'
// is returned even when the React state variable (simulated by a closure)
// still holds the pre-tx value.
describe('Regression: milestone submit — resultsRef pattern vs React state closure', () => {

  test('14. exhausted when check reads stale React state (the original bug)', async () => {
    // Simulates the broken pattern: milestoneRaw is a variable that is NOT
    // updated by the refetch (it would be updated by React after re-render).
    let milestoneRaw: { status: number } | undefined = { status: 0 }   // Pending

    // refetch would update wagmi cache, but milestoneRaw stays at status=0
    // until React re-renders (simulated here: we never update milestoneRaw)
    const refetch = mock(() => Promise.resolve())
    const prevStatus = 0   // Pending before tx

    const ctrl = new AbortController()
    const result = await retryRefetch([refetch], ctrl.signal, {
      maxAttempts: 2, intervalMs: 0,
      // Bug: reads from milestoneRaw (React state) — always sees old value
      check: () => {
        const raw = milestoneRaw
        return raw !== undefined && raw.status !== prevStatus
      },
    })

    // Even though the tx succeeded, the check returns false because
    // milestoneRaw still holds the pre-tx status → exhausted.
    expect(result).toBe('exhausted')
    expect(refetch).toHaveBeenCalledTimes(2)
  })

  test('15. fresh when check reads from resultsRef (the fix)', async () => {
    // Simulates the corrected pattern: the wrapped refetch writes results
    // into a ref; check() reads from the ref, not from React state.
    const resultsRef = { current: { status: undefined as number | undefined } }

    // milestoneRaw simulates React state — NOT updated until re-render
    const milestoneRaw: { status: number } = { status: 0 }   // Pending; never changes

    // The wrapped refetch: like the fixed wrappedRefetch in MilestoneRow,
    // it writes the post-tx result into the ref BEFORE check() fires.
    const wrappedRefetch = mock(async () => {
      // Simulates wagmi returning the updated on-chain data (status=1 = Submitted)
      resultsRef.current = { status: 1 }
    })

    const prevStatus = milestoneRaw.status   // 0 = Pending
    const ctrl = new AbortController()

    const result = await retryRefetch([wrappedRefetch], ctrl.signal, {
      maxAttempts: 4, intervalMs: 0,
      // Fix: reads from resultsRef, which was updated by wrappedRefetch
      check: () => {
        const r = resultsRef.current
        return r.status !== undefined && r.status !== prevStatus
      },
    })

    expect(result).toBe('fresh')
    expect(wrappedRefetch).toHaveBeenCalledTimes(1)
    // Confirm React state was NOT used: milestoneRaw still shows old value
    expect(milestoneRaw.status).toBe(0)
  })

  // ── 17. no-postcondition call always exhausts (refresh-only semantics) ──────
  test('17. no postcondition: exhausts after maxAttempts (fire-and-refresh behavior)', async () => {
    // This test documents the documented behavior: "treated as never-fresh".
    // The fix: callers that want refresh-only should use maxAttempts=1 so they
    // exhaust after a single read without showing an error banner (the 'exhausted'
    // result is intentionally ignored by refreshOnce()).
    const fn = mock(() => Promise.resolve())
    const ctrl = new AbortController()
    const result = await retryRefetch([fn], ctrl.signal, {
      maxAttempts: 2, intervalMs: 0,
      check: undefined,   // no postcondition
    })
    expect(result).toBe('exhausted')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  // ── 18. maxAttempts=1 no-postcondition is the correct refresh-only pattern ──
  test('18. maxAttempts=1 no postcondition: exhausts after exactly 1 read (refreshOnce pattern)', async () => {
    // This is the contract for refreshOnce(): one read, 'exhausted' result,
    // caller ignores the result — reads are fresh, no banner shown.
    const fn = mock(() => Promise.resolve())
    const ctrl = new AbortController()
    const result = await retryRefetch([fn], ctrl.signal, {
      maxAttempts: 1, intervalMs: 0,
      check: undefined,
    })
    expect(result).toBe('exhausted')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test('16. Retry reuses original postcondition — fresh on second call after initial exhaustion', async () => {
    // Simulates: first sync exhausts (data not yet updated), Retry fires
    // with the same postcondition, and this time the data has arrived.
    const resultsRef = { current: { status: undefined as number | undefined } }
    let callCount = 0

    const wrappedRefetch = mock(async () => {
      callCount++
      // First 4 calls: status still Pending (RPC lag)
      // Calls 5+: status is Submitted (data arrived)
      resultsRef.current = { status: callCount <= 4 ? 0 : 1 }
    })

    const prevStatus = 0
    const check = () => {
      const r = resultsRef.current
      return r.status !== undefined && r.status !== prevStatus
    }

    // First sync: exhausts after 4 attempts
    const ctrl1 = new AbortController()
    const r1 = await retryRefetch([wrappedRefetch], ctrl1.signal, {
      maxAttempts: 4, intervalMs: 0, check,
    })
    expect(r1).toBe('exhausted')
    expect(callCount).toBe(4)

    // Retry with same postcondition: now returns fresh immediately
    const ctrl2 = new AbortController()
    const r2 = await retryRefetch([wrappedRefetch], ctrl2.signal, {
      maxAttempts: 4, intervalMs: 0, check,   // same check closure
    })
    expect(r2).toBe('fresh')
    expect(callCount).toBe(5)   // only 1 more call needed
  })

})

// ── Regression: stale resultsRef caching ─────────────────────────────────────
// When a refetch fails, the resultsRef must NOT retain the prior attempt's
// successful result. This models the wrappedRefetch .catch() fix in MilestoneRow.
describe('stale resultsRef caching (regression)', () => {

  test('17. failed refetch clears prior result; postcondition does not reuse stale data', async () => {
    // Attempt 1: read succeeds, status=0 (still Pending — postcondition false).
    // Attempt 2: read fails — resultsRef cleared to undefined.
    // Attempt 3: read succeeds, status=1 (Submitted) — postcondition passes.
    const resultsRef = { current: { status: undefined as number | undefined } }
    let call = 0
    const wrappedRefetch = mock(async () => {
      call++
      if (call === 1) {
        resultsRef.current = { status: 0 }   // stale
      } else if (call === 2) {
        resultsRef.current = { status: undefined }   // cleared on failure
        throw new Error('RPC timeout')
      } else {
        resultsRef.current = { status: 1 }   // fresh
      }
    })
    const ctrl = new AbortController()
    const result = await retryRefetch([wrappedRefetch], ctrl.signal, {
      maxAttempts: 3, intervalMs: 0,
      check: () => { const s = resultsRef.current.status; return s !== undefined && s === 1 },
    })
    expect(result).toBe('fresh')
    expect(call).toBe(3)   // if stale caching bug existed, would be 1 (false fresh at attempt 1)
  })

  test('18. all reads fail: postcondition never satisfies; returns exhausted', async () => {
    const resultsRef = { current: { status: undefined as number | undefined } }
    const wrappedRefetch = mock(async () => {
      resultsRef.current = { status: undefined }
      throw new Error('RPC down')
    })
    const ctrl = new AbortController()
    const result = await retryRefetch([wrappedRefetch], ctrl.signal, {
      maxAttempts: 3, intervalMs: 0,
      check: () => { const s = resultsRef.current.status; return s !== undefined && s === 1 },
    })
    expect(result).toBe('exhausted')
  })

  test('19. read succeeds with wrong-scope data (mismatched URL): not fresh, exhausted', async () => {
    const resultsRef = { current: { status: undefined as number | undefined, evidenceUrl: undefined as string | undefined } }
    const wrappedRefetch = mock(async () => {
      resultsRef.current = { status: 1, evidenceUrl: 'https://other.com' }  // different URL
    })
    const expectedUrl = 'https://correct.com'
    const ctrl = new AbortController()
    const result = await retryRefetch([wrappedRefetch], ctrl.signal, {
      maxAttempts: 2, intervalMs: 0,
      check: () => {
        const r = resultsRef.current
        return r.status !== undefined && r.status === 1 &&
               r.evidenceUrl !== undefined && r.evidenceUrl === expectedUrl
      },
    })
    expect(result).toBe('exhausted')
  })

  test('20. no-postcondition with maxAttempts=1 fires exactly once (refreshOnce pattern)', async () => {
    // Documents the correct refresh-only pattern: maxAttempts=1, no check.
    // 'exhausted' result is expected and intentionally ignored by the caller.
    const fn = mock(() => Promise.resolve())
    const ctrl = new AbortController()
    const result = await retryRefetch([fn], ctrl.signal, { maxAttempts: 1, intervalMs: 0 })
    expect(result).toBe('exhausted')
    expect(fn).toHaveBeenCalledTimes(1)
  })

})

// ── Regression: r.error check in wagmi refetch wrappers ─────────────────────
// A wagmi refetch can resolve (not reject) with { data: undefined, error: Error }.
// The .then() handler must treat r.error != null as a failed read, same as rejection.
describe('r.error in resolved refetch response (regression)', () => {

  test('21. resolved refetch with r.error clears the result field', async () => {
    // Simulates a wagmi refetch that resolves with an error response.
    // The wrapper must detect r.error and clear the result, not keep stale data.
    const resultsRef = { current: { value: undefined as bigint | undefined } }
    const wrappedRefetch = mock(async () => {
      // First call: error response (wagmi fulfills, but with error).
      const response = { data: undefined as bigint | undefined, error: new Error('RPC failed') }
      if (response.error != null) {
        resultsRef.current.value = undefined   // wrapper clears on error
      } else {
        resultsRef.current.value = response.data
      }
    })
    const ctrl = new AbortController()
    const result = await retryRefetch([wrappedRefetch], ctrl.signal, {
      maxAttempts: 1, intervalMs: 0,
      check: () => resultsRef.current.value !== undefined && resultsRef.current.value === 0n,
    })
    // 0n would pass `=== 0n` if we stored it, but we cleared it → exhausted
    expect(result).toBe('exhausted')
    expect(resultsRef.current.value).toBeUndefined()
  })

  test('22. resolved refetch with r.error does not satisfy claim postcondition via zero default', async () => {
    // The claim postcondition requires pendingWithdraw !== undefined && === 0n.
    // If a read fails (r.error set), pendingWithdraw stays undefined → fails check.
    // Without the r.error guard, undefined could be interpreted as 0n by naive code.
    const resultsRef = { current: { pendingWithdraw: undefined as bigint | undefined } }
    const wrappedRefetch = mock(async () => {
      const response = { data: undefined as bigint | undefined, error: new Error('RPC error') }
      // Correct behavior: check r.error before assigning
      resultsRef.current.pendingWithdraw = (response.error == null && typeof response.data === 'bigint')
        ? response.data : undefined
    })
    const ctrl = new AbortController()
    const result = await retryRefetch([wrappedRefetch], ctrl.signal, {
      maxAttempts: 2, intervalMs: 0,
      // Claim postcondition: must be defined AND 0n — not just any falsy value
      check: () => {
        const p = resultsRef.current.pendingWithdraw
        return p !== undefined && p === 0n
      },
    })
    expect(result).toBe('exhausted')
    expect(resultsRef.current.pendingWithdraw).toBeUndefined()
  })

})

// ── Regression: abort() on useRefetchGroup (identity-change cancellation) ────
// abort() must cancel an in-flight loop and increment syncGenRef to prevent
// a settled result from a prior identity's sync from writing state.
describe('abort() for identity-change cancellation (regression)', () => {

  test('23. aborting an in-flight signal returns cancelled', async () => {
    // Simulates calling abort() during an in-flight retryRefetch loop.
    // The signal is aborted partway through — result must be cancelled.
    const ctrl = new AbortController()
    let calls = 0
    const slowRefetch = () => new Promise<void>(res => {
      calls++
      setTimeout(res, 5)   // takes 5ms
    })
    // Abort after 2ms (mid-refetch)
    setTimeout(() => ctrl.abort(), 2)
    const result = await retryRefetch([slowRefetch], ctrl.signal, {
      maxAttempts: 4, intervalMs: 0,
      check: () => false,   // never passes
    })
    expect(result).toBe('cancelled')
  })

  test('24. abort() followed by a new syncAll for new identity — old result cannot write state', async () => {
    // Models: wallet changes mid-sync. The syncGenRef is incremented by the
    // identity-change effect. When the old sync resolves 'cancelled', the gen
    // guard prevents it from calling setSyncState.
    let syncGen = 0
    const syncGenRef = { current: 0 }

    // Old sync: aborted signal
    const oldCtrl = new AbortController()
    oldCtrl.abort()   // abort immediately (simulates identity change)

    // New sync: fresh signal
    const newCtrl = new AbortController()
    syncGenRef.current++   // identity-change effect increments gen
    const newGen = syncGenRef.current

    const oldSyncPromise = retryRefetch([], oldCtrl.signal, { maxAttempts: 1, intervalMs: 0 })
    const newSyncPromise = retryRefetch([], newCtrl.signal, { maxAttempts: 1, intervalMs: 0 })

    const [oldResult, newResult] = await Promise.all([oldSyncPromise, newSyncPromise])

    // Old sync was cancelled — gen guard fires: oldGen (0) !== syncGenRef.current (1)
    if (oldResult !== 'cancelled') {
      // Would write state — old gen must not match current
      const capturedOldGen = 0   // captured before increment
      expect(capturedOldGen).not.toBe(syncGenRef.current)
    }
    expect(oldResult).toBe('cancelled')
    // New sync exhausted (no check, maxAttempts=1), gen matches
    expect(newResult).toBe('exhausted')
    expect(newGen).toBe(syncGenRef.current)
  })

})
