/**
 * Tests for milestone action-specific postconditions (milestonePostconditions.ts).
 *
 * These tests verify:
 *  1. Each check returns true only for the exact expected contract transition.
 *  2. A failed read (status === undefined) never satisfies any check.
 *  3. checkSubmit requires both the correct status AND the exact URL.
 *  4. A stale cached result with the wrong status does not satisfy the check.
 *  5. Retry recovery: exhausted on attempt 1, fresh on attempt 2 after data arrives.
 *  6. Superseded sync: older sync cannot overwrite newer sync state.
 *  7. Mismatched evidence URL (stale cache from older tx) does not satisfy checkSubmit.
 */

import { describe, test, expect, mock } from 'bun:test'
import {
  checkSubmit, checkApprove, checkDispute, checkRelease, checkRefund,
  MilestoneStatusNum,
} from '../milestonePostconditions'
import { retryRefetch } from '../retryRefetch'
import type { MilestoneResultSnapshot } from '../milestonePostconditions'

const { Pending, Submitted, Approved, Released, Disputed, Refunded } = MilestoneStatusNum

// Helper: build a snapshot
const snap = (status: number | undefined, url?: string): MilestoneResultSnapshot => ({
  status,
  evidenceUrl: url,
})

// ── 1. checkSubmit ────────────────────────────────────────────────────────────
describe('checkSubmit', () => {
  const url = 'https://example.com/evidence'
  const check = checkSubmit(url)

  test('1a. passes when status=Submitted and url matches exactly', () => {
    expect(check(snap(Submitted, url))).toBe(true)
  })
  test('1b. fails when status=Submitted but url is different (stale from older tx)', () => {
    expect(check(snap(Submitted, 'https://example.com/OLD'))).toBe(false)
  })
  test('1c. fails when status=Submitted but url is undefined (read failed)', () => {
    expect(check(snap(Submitted, undefined))).toBe(false)
  })
  test('1d. fails when status=Pending (no transition yet)', () => {
    expect(check(snap(Pending, url))).toBe(false)
  })
  test('1e. fails when status=undefined (read failed)', () => {
    expect(check(snap(undefined, url))).toBe(false)
  })
  test('1f. fails when status=Approved (wrong transition)', () => {
    expect(check(snap(Approved, url))).toBe(false)
  })
  test('1g. fails when url is empty string', () => {
    expect(check(snap(Submitted, ''))).toBe(false)
  })
})

// ── 2. checkApprove ───────────────────────────────────────────────────────────
describe('checkApprove', () => {
  const check = checkApprove()

  test('2a. passes when status=Approved', () => {
    expect(check(snap(Approved))).toBe(true)
  })
  test('2b. fails when status=Submitted (not yet approved)', () => {
    expect(check(snap(Submitted))).toBe(false)
  })
  test('2c. fails when status=Released (different terminal)', () => {
    expect(check(snap(Released))).toBe(false)
  })
  test('2d. fails when status=undefined (read failed)', () => {
    expect(check(snap(undefined))).toBe(false)
  })
})

// ── 3. checkDispute ───────────────────────────────────────────────────────────
describe('checkDispute', () => {
  const check = checkDispute()

  test('3a. passes when status=Disputed', () => {
    expect(check(snap(Disputed))).toBe(true)
  })
  test('3b. fails when status=Submitted (not yet disputed)', () => {
    expect(check(snap(Submitted))).toBe(false)
  })
  test('3c. fails when status=undefined (read failed)', () => {
    expect(check(snap(undefined))).toBe(false)
  })
})

// ── 4. checkRelease ───────────────────────────────────────────────────────────
describe('checkRelease (releaseMilestone + resolveDispute favorFunder=false)', () => {
  const check = checkRelease()

  test('4a. passes when status=Released', () => {
    expect(check(snap(Released))).toBe(true)
  })
  test('4b. fails when status=Approved (not yet released)', () => {
    expect(check(snap(Approved))).toBe(false)
  })
  test('4c. fails when status=Disputed (wrong terminal for Award to Builder)', () => {
    expect(check(snap(Disputed))).toBe(false)
  })
  test('4d. fails when status=undefined (read failed)', () => {
    expect(check(snap(undefined))).toBe(false)
  })
  test('4e. fails when status=Refunded (Refund path, not Award path)', () => {
    expect(check(snap(Refunded))).toBe(false)
  })
})

// ── 5. checkRefund ────────────────────────────────────────────────────────────
describe('checkRefund (resolveDispute favorFunder=true + claimExpiredMilestone)', () => {
  const check = checkRefund()

  test('5a. passes when status=Refunded', () => {
    expect(check(snap(Refunded))).toBe(true)
  })
  test('5b. fails when status=Released (Award path, not Refund)', () => {
    expect(check(snap(Released))).toBe(false)
  })
  test('5c. fails when status=Pending (not yet reclaimed)', () => {
    expect(check(snap(Pending))).toBe(false)
  })
  test('5d. fails when status=undefined (read failed)', () => {
    expect(check(snap(undefined))).toBe(false)
  })
})

// ── 6. Integration: retryRefetch with action-specific checks ─────────────────
describe('retryRefetch integration with action postconditions', () => {
  const tick = (ms = 0) => new Promise<void>(r => setTimeout(r, ms))

  test('6a. Submit: exhausted when status is correct but URL mismatches (stale cache)', async () => {
    // Simulates the pre-fix bug: refetch returns Submitted status but with
    // an older evidence URL from a previously submitted milestone.
    const submittedUrl = 'https://example.com/new-work'
    const staleUrl     = 'https://example.com/OLD-work'

    let snap: MilestoneResultSnapshot = { status: Submitted, evidenceUrl: staleUrl }
    const refetch = mock(async () => { /* snap already has stale url */ })
    const ctrl = new AbortController()

    const result = await retryRefetch([refetch], ctrl.signal, {
      maxAttempts: 2, intervalMs: 0,
      check: () => checkSubmit(submittedUrl)(snap),
    })

    expect(result).toBe('exhausted')
    expect(refetch).toHaveBeenCalledTimes(2)
  })

  test('6b. Submit: fresh when URL matches on attempt 2 (delayed RPC)', async () => {
    const submittedUrl = 'https://example.com/work'
    let snap: MilestoneResultSnapshot = { status: Pending, evidenceUrl: undefined }
    let callCount = 0

    const refetch = mock(async () => {
      callCount++
      if (callCount >= 2) snap = { status: Submitted, evidenceUrl: submittedUrl }
    })
    const ctrl = new AbortController()

    const result = await retryRefetch([refetch], ctrl.signal, {
      maxAttempts: 4, intervalMs: 0,
      check: () => checkSubmit(submittedUrl)(snap),
    })

    expect(result).toBe('fresh')
    expect(callCount).toBe(2)
  })

  test('6c. Approve: failed read (status=undefined) never satisfies check', async () => {
    let snap: MilestoneResultSnapshot = { status: undefined, evidenceUrl: undefined }
    const refetch = mock(async () => { /* read fails, snap stays undefined */ })
    const ctrl = new AbortController()

    const result = await retryRefetch([refetch], ctrl.signal, {
      maxAttempts: 2, intervalMs: 0,
      check: () => checkApprove()(snap),
    })

    expect(result).toBe('exhausted')
  })

  test('6d. Retry recovery: exhausted on first run, fresh on retry after data arrives', async () => {
    const url = 'https://example.com/delivery'
    let snap: MilestoneResultSnapshot = { status: Pending, evidenceUrl: undefined }
    let callCount = 0

    // First run: data never arrives → exhausted
    const ctrl1 = new AbortController()
    const r1 = await retryRefetch([mock(async () => { callCount++ })], ctrl1.signal, {
      maxAttempts: 2, intervalMs: 0,
      check: () => checkSubmit(url)(snap),
    })
    expect(r1).toBe('exhausted')
    expect(callCount).toBe(2)

    // Data arrives externally (e.g. RPC eventually responded)
    snap = { status: Submitted, evidenceUrl: url }

    // Retry with the same check — should pass immediately
    const ctrl2 = new AbortController()
    const r2 = await retryRefetch([mock(async () => { callCount++ })], ctrl2.signal, {
      maxAttempts: 4, intervalMs: 0,
      check: () => checkSubmit(url)(snap),
    })
    expect(r2).toBe('fresh')
    expect(callCount).toBe(3)  // only 1 more refetch needed
  })

  test('6e. Superseded sync: cancelled sync does not return fresh or exhausted', async () => {
    const url = 'https://example.com/work'
    const snap: MilestoneResultSnapshot = { status: Submitted, evidenceUrl: url }

    const ctrl = new AbortController()
    ctrl.abort()  // already cancelled

    const result = await retryRefetch([mock(async () => {})], ctrl.signal, {
      maxAttempts: 4, intervalMs: 0,
      check: () => checkSubmit(url)(snap),
    })
    expect(result).toBe('cancelled')
  })

  test('6f. Award to Builder: checkRelease, not checkRefund', async () => {
    // Verifies correct distinction between the two arbitrator resolution paths
    let snap: MilestoneResultSnapshot = { status: Disputed, evidenceUrl: undefined }
    let callCount = 0
    const refetch = mock(async () => {
      callCount++
      if (callCount >= 2) snap = { status: Released, evidenceUrl: undefined }
    })
    const ctrl = new AbortController()

    // checkRefund would NOT satisfy Released status
    const wrongResult = await retryRefetch([mock(async () => { snap = { status: Released, evidenceUrl: undefined } })], new AbortController().signal, {
      maxAttempts: 1, intervalMs: 0,
      check: () => checkRefund()(snap),
    })
    expect(wrongResult).toBe('exhausted')  // Released does NOT satisfy checkRefund

    // checkRelease DOES satisfy Released status
    const rightResult = await retryRefetch([mock(async () => { snap = { status: Released, evidenceUrl: undefined } })], new AbortController().signal, {
      maxAttempts: 1, intervalMs: 0,
      check: () => checkRelease()(snap),
    })
    expect(rightResult).toBe('fresh')
  })

  test('6g. Refund to Funder: checkRefund, not checkRelease', async () => {
    const snap: MilestoneResultSnapshot = { status: Refunded, evidenceUrl: undefined }

    const releaseResult = await retryRefetch([mock(async () => {})], new AbortController().signal, {
      maxAttempts: 1, intervalMs: 0,
      check: () => checkRelease()(snap),
    })
    expect(releaseResult).toBe('exhausted')  // Refunded does NOT satisfy checkRelease

    const refundResult = await retryRefetch([mock(async () => {})], new AbortController().signal, {
      maxAttempts: 1, intervalMs: 0,
      check: () => checkRefund()(snap),
    })
    expect(refundResult).toBe('fresh')
  })
})
