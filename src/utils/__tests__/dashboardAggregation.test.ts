/**
 * Tests for computeDashboardStats — the pure aggregation function used by Dashboard.
 *
 * Tests import the same function the component uses. Any drift between the
 * tests and the live aggregation is a compile error or test failure.
 *
 * Key invariant under test:
 *   If ANY agreement read fails, statsError must be true and totals must not
 *   be computed from the successful subset. The function must never present
 *   partial sums as complete totals.
 */

import { describe, test, expect } from 'bun:test'
import { computeDashboardStats } from '../dashboardAggregation'
import type { AgreementData, MilestoneData } from '../../types/pactflow'

// ── Test fixtures ─────────────────────────────────────────────────────────────

const ADDR_F = '0x1111111111111111111111111111111111111111'
const ADDR_B = '0x2222222222222222222222222222222222222222'
const ADDR_A = '0x3333333333333333333333333333333333333333'

function makeAgreement(overrides: Partial<AgreementData> = {}): AgreementData {
  return {
    funder: ADDR_F,
    builder: ADDR_B,
    arbitrator: ADDR_A,
    token: '0x3600000000000000000000000000000000000000',
    status: 0,       // Active
    milestones: [],
    totalAmount: 1_000_000n, // 1.00 USDC
    totalFunded: 0n,
    pendingCount: 1n,
    activeCount: 0n,
    isFunded: false,
    ...overrides,
  }
}

function makeMilestone(overrides: Partial<MilestoneData> = {}): MilestoneData {
  return {
    description: 'Test milestone',
    amount: 1_000_000n,  // 1.00 USDC
    deadline: 9999999999,
    disputeDeadline: 0,
    status: 0,           // Pending
    evidenceUrl: '',
    fundsReleased: false,
    ...overrides,
  }
}

// ── Helper: build a loaded data map ──────────────────────────────────────────

function makeMap(entries: [string, AgreementData][]): Map<string, AgreementData> {
  return new Map(entries)
}

function makeErrorSet(ids: string[]): Set<string> {
  return new Set(ids)
}

// ═════════════════════════════════════════════════════════════════════════════
// Suite 1: Core statsReady / statsError logic
// ═════════════════════════════════════════════════════════════════════════════

describe('computeDashboardStats — core invariants', () => {

  test('1. confirmed empty (totalAgreements=0): statsReady=true, statsError=false, all zeros', () => {
    const result = computeDashboardStats(makeMap([]), makeErrorSet([]), 0)
    expect(result.statsReady).toBe(true)
    expect(result.statsError).toBe(false)
    expect(result.totalLocked).toBe(0n)
    expect(result.totalReleased).toBe(0n)
    expect(result.activeCount).toBe(0)
  })

  test('2. count not loaded yet (totalAgreements=-1): statsReady=false (skeleton)', () => {
    const result = computeDashboardStats(makeMap([]), makeErrorSet([]), -1)
    expect(result.statsReady).toBe(false)
    expect(result.statsError).toBe(false)
  })

  test('3. count loaded, no agreements resolved yet: statsReady=false', () => {
    // 3 agreements known, 0 resolved
    const result = computeDashboardStats(makeMap([]), makeErrorSet([]), 3)
    expect(result.statsReady).toBe(false)
  })

  test('4. all agreements loaded successfully: statsReady=true, statsError=false', () => {
    const loaded = makeMap([
      ['0', makeAgreement({ isFunded: true, totalAmount: 5_000_000n })],
      ['1', makeAgreement({ isFunded: false })],
    ])
    const result = computeDashboardStats(loaded, makeErrorSet([]), 2)
    expect(result.statsReady).toBe(true)
    expect(result.statsError).toBe(false)
  })

})

// ═════════════════════════════════════════════════════════════════════════════
// Suite 2: Partial read failures — the key correctness invariant
// ═════════════════════════════════════════════════════════════════════════════

describe('computeDashboardStats — partial failure invalidates totals', () => {

  test('5. one failure out of three: statsError=true even though two succeeded', () => {
    // 2 successful, 1 errored — totals from partial subset must not be trusted
    const loaded = makeMap([
      ['0', makeAgreement({ isFunded: true, totalAmount: 10_000_000n })],
      ['1', makeAgreement({ isFunded: true, totalAmount: 5_000_000n })],
    ])
    const errors = makeErrorSet(['2'])

    const result = computeDashboardStats(loaded, errors, 3)
    expect(result.statsReady).toBe(true)
    expect(result.statsError).toBe(true)
    // Totals must be zero — never display partial sums as complete
    expect(result.totalLocked).toBe(0n)
    expect(result.totalReleased).toBe(0n)
    expect(result.activeCount).toBe(0)
  })

  test('6. all four errored: statsError=true, all zeros', () => {
    const errors = makeErrorSet(['0', '1', '2', '3'])
    const result = computeDashboardStats(makeMap([]), errors, 4)
    expect(result.statsReady).toBe(true)
    expect(result.statsError).toBe(true)
    expect(result.totalLocked).toBe(0n)
  })

  test('7. mixed: 3 success + 1 error out of 4 total: statsError=true', () => {
    const loaded = makeMap([
      ['0', makeAgreement({ isFunded: true, totalAmount: 1_000_000n })],
      ['1', makeAgreement({ isFunded: true, totalAmount: 2_000_000n })],
      ['2', makeAgreement({ isFunded: false })],
    ])
    const errors = makeErrorSet(['3'])

    const result = computeDashboardStats(loaded, errors, 4)
    expect(result.statsReady).toBe(true)
    expect(result.statsError).toBe(true)
    // Do NOT present the 3.00 USDC computed from successful reads
    expect(result.totalLocked).toBe(0n)
  })

  test('8. only 1 loaded out of 3 — still pending (not an error): statsReady=false', () => {
    const loaded = makeMap([['0', makeAgreement()]])
    // No errors — the other two are still loading
    const result = computeDashboardStats(loaded, makeErrorSet([]), 3)
    expect(result.statsReady).toBe(false)
    expect(result.statsError).toBe(false)
  })

})

// ═════════════════════════════════════════════════════════════════════════════
// Suite 3: Retry recovery — clearing an error after successful reload
// ═════════════════════════════════════════════════════════════════════════════

describe('computeDashboardStats — retry recovery', () => {

  test('9. error cleared from errorIds after retry: statsError becomes false', () => {
    // Before retry: id "2" is in errorIds
    const loaded = makeMap([
      ['0', makeAgreement()],
      ['1', makeAgreement()],
    ])
    const errorsBefore = makeErrorSet(['2'])
    const before = computeDashboardStats(loaded, errorsBefore, 3)
    expect(before.statsError).toBe(true)

    // After retry: id "2" load succeeds — removed from errorIds, added to loadedData
    const loadedAfter = makeMap([
      ['0', makeAgreement()],
      ['1', makeAgreement()],
      ['2', makeAgreement({ isFunded: true, totalAmount: 3_000_000n })],
    ])
    const errorsAfter = makeErrorSet([])  // error cleared
    const after = computeDashboardStats(loadedAfter, errorsAfter, 3)
    expect(after.statsReady).toBe(true)
    expect(after.statsError).toBe(false)
    // Now totals are computed from all three
    expect(after.totalLocked).toBe(3_000_000n)
  })

  test('10. retry that still fails: statsError remains true', () => {
    const loaded = makeMap([
      ['0', makeAgreement()],
      ['1', makeAgreement()],
    ])
    const errors = makeErrorSet(['2'])  // still errored after retry
    const result = computeDashboardStats(loaded, errors, 3)
    expect(result.statsReady).toBe(true)
    expect(result.statsError).toBe(true)
    expect(result.totalLocked).toBe(0n)
  })

})

// ═════════════════════════════════════════════════════════════════════════════
// Suite 4: Correct total calculations (only when statsError=false)
// ═════════════════════════════════════════════════════════════════════════════

describe('computeDashboardStats — total calculations', () => {

  test('11. totalLocked = funded agreements minus released and refunded milestones', () => {
    const releasedMs = makeMilestone({ status: 3, amount: 400_000n })  // Released
    const refundedMs = makeMilestone({ status: 5, amount: 200_000n })  // Refunded
    const pendingMs  = makeMilestone({ status: 0, amount: 400_000n })  // Pending

    const ag = makeAgreement({
      isFunded: true,
      totalAmount: 1_000_000n,
      milestones: [releasedMs, refundedMs, pendingMs],
      status: 0,  // Active
    })
    const loaded = makeMap([['0', ag]])
    const result = computeDashboardStats(loaded, makeErrorSet([]), 1)

    // totalLocked = 1_000_000 - 400_000 (released) - 200_000 (refunded) = 400_000
    expect(result.totalLocked).toBe(400_000n)
    // totalReleased = 400_000 (the released milestone only)
    expect(result.totalReleased).toBe(400_000n)
    expect(result.statsError).toBe(false)
  })

  test('12. unfunded agreements do not contribute to totalLocked', () => {
    const ag = makeAgreement({ isFunded: false, totalAmount: 5_000_000n, status: 0 })
    const result = computeDashboardStats(makeMap([['0', ag]]), makeErrorSet([]), 1)
    expect(result.totalLocked).toBe(0n)
  })

  test('13. activeCount counts only Active (status=0) agreements', () => {
    const loaded = makeMap([
      ['0', makeAgreement({ status: 0 })],  // Active
      ['1', makeAgreement({ status: 1 })],  // Completed
      ['2', makeAgreement({ status: 0 })],  // Active
      ['3', makeAgreement({ status: 2 })],  // Cancelled
    ])
    const result = computeDashboardStats(loaded, makeErrorSet([]), 4)
    expect(result.activeCount).toBe(2)
  })

  test('14. totalReleased sums across multiple agreements', () => {
    const ms1 = makeMilestone({ status: 3, amount: 1_000_000n })  // Released
    const ms2 = makeMilestone({ status: 3, amount: 2_500_000n })  // Released
    const loaded = makeMap([
      ['0', makeAgreement({ isFunded: true, totalAmount: 1_000_000n, milestones: [ms1] })],
      ['1', makeAgreement({ isFunded: true, totalAmount: 2_500_000n, milestones: [ms2] })],
    ])
    const result = computeDashboardStats(loaded, makeErrorSet([]), 2)
    expect(result.totalReleased).toBe(3_500_000n)
    expect(result.statsError).toBe(false)
  })

  test('15. zero is only shown when all reads succeeded and the sum is actually zero', () => {
    // Agreement with no funded milestones released — locked is genuinely zero
    const ag = makeAgreement({ isFunded: false, totalAmount: 1_000_000n, status: 1 }) // Completed, unfunded
    const result = computeDashboardStats(makeMap([['0', ag]]), makeErrorSet([]), 1)
    expect(result.statsError).toBe(false)
    expect(result.totalLocked).toBe(0n)    // genuinely zero — safe to show
    expect(result.totalReleased).toBe(0n)  // genuinely zero — safe to show
  })

})
