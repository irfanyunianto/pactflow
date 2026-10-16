/**
 * Pure aggregation for Dashboard totals.
 *
 * Extracted so both the Dashboard component and the test suite import
 * the same function — no duplication, no divergence.
 *
 * Correctness invariant:
 *   If ANY required agreement read has errored, the totals are INVALID
 *   and statsError must be true. Totals derived from a partial subset
 *   must never be presented as complete.
 */

import { AgreementStatus, MilestoneStatus } from '@/contracts/pactflow'
import type { AgreementData } from '@/types/pactflow'

const AS_Active    = Number(AgreementStatus.Active)
const MS_Released  = Number(MilestoneStatus.Released)
const MS_Refunded  = Number(MilestoneStatus.Refunded)

export interface DashboardStats {
  /** True once all agreement IDs have either loaded or errored — no pending reads. */
  statsReady: boolean
  /**
   * True when statsReady AND at least one agreement read failed.
   * In this case totalLocked/totalReleased/activeCount are not trustworthy
   * and must NOT be displayed as the real totals.
   */
  statsError: boolean
  /** Sum of escrow balances across active, funded agreements. */
  totalLocked: bigint
  /** Sum of released milestone amounts across all agreements. */
  totalReleased: bigint
  /** Number of agreements with Active status. */
  activeCount: number
}

/**
 * Compute aggregate dashboard totals.
 *
 * @param loadedData     Map of agreementId (string) → AgreementData from successful reads.
 * @param errorIds       Set of agreementId (string) strings that failed to load.
 * @param totalAgreements  Total count returned by agreementCount() on-chain.
 */
export function computeDashboardStats(
  loadedData: Map<string, AgreementData>,
  errorIds: Set<string>,
  totalAgreements: number,
): DashboardStats {
  const resolvedCount = loadedData.size + errorIds.size
  // statsReady: every known agreement ID has settled (either data or error).
  // When totalAgreements === 0, we consider stats ready with zeroes (confirmed empty).
  // When totalAgreements < 0, the count hasn't loaded yet — not ready.
  const statsReady = totalAgreements >= 0 && (totalAgreements === 0 || resolvedCount >= totalAgreements)

  // If ANY agreement failed to load, the totals cannot be trusted.
  // Even a single missing agreement could be the largest one.
  const statsError = statsReady && errorIds.size > 0

  let totalLocked   = 0n
  let totalReleased = 0n
  let activeCount   = 0

  // Only compute totals when all reads succeeded — never present partial sums.
  if (!statsError) {
    for (const ag of loadedData.values()) {
      const msArr = Array.isArray(ag.milestones)
        ? (ag.milestones)
        : []

      const releasedAmt = msArr
        .filter(m => Number(m.status) === MS_Released)
        .reduce((s, m) => s + (m.amount ?? 0n), 0n)
      const refundedAmt = msArr
        .filter(m => Number(m.status) === MS_Refunded)
        .reduce((s, m) => s + (m.amount ?? 0n), 0n)
      const total = ag.totalAmount ?? 0n

      if (ag.isFunded) totalLocked += total - releasedAmt - refundedAmt
      totalReleased += releasedAmt
      if (Number(ag.status) === AS_Active) activeCount++
    }
  }

  return { statsReady, statsError, totalLocked, totalReleased, activeCount }
}
