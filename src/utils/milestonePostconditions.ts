/**
 * Action-specific milestone sync postconditions.
 *
 * Each postcondition is a pure function that reads from the
 * MilestoneResultSnapshot written by the wrappedRefetch wrapper in
 * MilestoneRow. The snapshot is populated BEFORE retryRefetch's check()
 * fires, so it always reflects the just-completed refetch — not stale
 * React state.
 *
 * Rules enforced here:
 *  - A failed read (field === undefined) must NOT satisfy any check.
 *  - Each check requires the exact target status from the contract transition,
 *    not just "any status different from before".
 *  - Submit additionally requires the evidence URL to match what was submitted,
 *    guarding against a cached stale response that happens to have a different
 *    URL from an older tx.
 *
 * Contract transitions (PactFlow.sol):
 *   submitEvidence        → Pending → Submitted
 *   approveMilestone      → Submitted → Approved
 *   raiseDispute          → Submitted → Disputed
 *   releaseMilestone      → Approved → Released
 *   resolveDispute(false) → Disputed → Released    (Award to Builder)
 *   resolveDispute(true)  → Disputed → Refunded    (Refund to Funder)
 *   claimExpiredMilestone → Pending  → Refunded
 *   cancelAgreement       → any Pending → Refunded (handled at agreement level)
 */

export interface MilestoneResultSnapshot {
  /** Status from the most recent refetch. undefined if the read failed. */
  status: number | undefined
  /** evidenceUrl from the most recent refetch. undefined if the read failed. */
  evidenceUrl: string | undefined
}

export type MilestoneCheck = (snap: MilestoneResultSnapshot) => boolean

/**
 * Submit: status must be Submitted AND the evidenceUrl must match the exact
 * URL submitted in the tx. This prevents a stale cached response (from an
 * older tx) with a different URL from satisfying the check.
 */
export function checkSubmit(expectedUrl: string): MilestoneCheck {
  return (snap) =>
    snap.status === 1 /* Submitted */ &&
    snap.evidenceUrl !== undefined &&
    snap.evidenceUrl === expectedUrl
}

/**
 * Approve: status must be exactly Approved (2).
 */
export function checkApprove(): MilestoneCheck {
  return (snap) => snap.status === 2 /* Approved */
}

/**
 * Dispute: status must be exactly Disputed (4).
 */
export function checkDispute(): MilestoneCheck {
  return (snap) => snap.status === 4 /* Disputed */
}

/**
 * Release payment or Award to Builder (resolveDispute favorFunder=false):
 * status must be exactly Released (3).
 */
export function checkRelease(): MilestoneCheck {
  return (snap) => snap.status === 3 /* Released */
}

/**
 * Refund to Funder (resolveDispute favorFunder=true) or
 * claimExpiredMilestone: status must be exactly Refunded (5).
 */
export function checkRefund(): MilestoneCheck {
  return (snap) => snap.status === 5 /* Refunded */
}

// Re-export milestone status constants so callers don't need magic numbers.
export const MilestoneStatusNum = {
  Pending:   0,
  Submitted: 1,
  Approved:  2,
  Released:  3,
  Disputed:  4,
  Refunded:  5,
} as const
