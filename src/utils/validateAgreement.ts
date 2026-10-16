/**
 * Pure validation for CreateAgreement form inputs.
 *
 * This module is the single source of truth for frontend pre-flight checks.
 * Tests import from here; the component imports from here — no duplication.
 *
 * Contract limits vs frontend policies:
 *  - MAX_MILESTONES = 20 is a deployed contract constant (PactFlow.sol line 82).
 *  - amount > 0 is a deployed contract check (InvalidMilestoneAmount).
 *  - deadline > 0 is a deployed contract check (InvalidMilestoneDeadline).
 *  - Distinct roles (RolesNotDistinct) is a deployed contract check.
 *  - Description length (256 chars) is a FRONTEND POLICY — not enforced on-chain.
 *  - Maximum USDC amount (1,000,000) is a FRONTEND POLICY — not enforced on-chain.
 *  - Deadlines in the future is a FRONTEND POLICY — the contract only requires > 0.
 */

import { isAddress } from 'viem'
import { parseUSDCExact } from './parseUSDC'

export interface MilestoneFormInput {
  description: string
  amount: string
  deadline: string
}

// Frontend policy — not a contract requirement
export const MAX_DESCRIPTION_LENGTH = 256

/**
 * Returns a human-readable error string or null if valid.
 * The connected wallet address is the funder (msg.sender on createAgreement).
 */
export function validateAgreementForm(
  funderAddress: string | undefined,
  builder: string,
  arbitrator: string,
  milestones: MilestoneFormInput[],
): string | null {
  if (!builder || !isAddress(builder))       return 'Enter a valid builder address'
  if (!arbitrator || !isAddress(arbitrator)) return 'Enter a valid arbitrator address'

  if (funderAddress) {
    const f = funderAddress.toLowerCase()
    if (builder.toLowerCase()    === f) return 'Builder cannot be the same as your wallet'
    if (arbitrator.toLowerCase() === f) return 'Arbitrator cannot be the same as your wallet'
  }

  if (builder.toLowerCase() === arbitrator.toLowerCase()) {
    return 'Builder and arbitrator must be different addresses'
  }

  if (milestones.length === 0) return 'Add at least one milestone'

  for (let i = 0; i < milestones.length; i++) {
    const m   = milestones[i]
    const idx = i + 1

    if (!m.description.trim()) {
      return `Milestone ${idx}: description required`
    }
    // Frontend policy: 256 chars (not a contract limit)
    if (m.description.trim().length > MAX_DESCRIPTION_LENGTH) {
      return `Milestone ${idx}: description too long (max ${MAX_DESCRIPTION_LENGTH} chars — frontend limit)`
    }

    const amtResult = parseUSDCExact(m.amount)
    if (!amtResult.ok) {
      const reasons: Record<string, string> = {
        empty:            `Milestone ${idx}: amount is required`,
        invalid:          `Milestone ${idx}: enter a valid USDC amount`,
        negative:         `Milestone ${idx}: amount must be positive`,
        zero:             `Milestone ${idx}: amount must be greater than zero`,
        too_small:        `Milestone ${idx}: minimum is 0.000001 USDC`,
        too_many_decimals:`Milestone ${idx}: USDC supports at most 6 decimal places`,
        // Frontend policy: 1M USDC cap (not a contract limit)
        too_large:        `Milestone ${idx}: amount exceeds 1,000,000 USDC (frontend limit, not contract)`,
      }
      return reasons[amtResult.reason] ?? `Milestone ${idx}: invalid amount`
    }

    if (!m.deadline) {
      return `Milestone ${idx}: deadline required`
    }

    const deadlineTs = Math.floor(new Date(m.deadline).getTime() / 1000)
    if (isNaN(deadlineTs) || deadlineTs <= 0) {
      return `Milestone ${idx}: invalid deadline`
    }
    // Frontend policy: future deadline (contract only requires > 0)
    if (deadlineTs <= Math.floor(Date.now() / 1000)) {
      return `Milestone ${idx}: deadline must be in the future (frontend policy; contract requires only a non-zero value)`
    }
  }

  return null
}

/**
 * Eligibility check for claimExpiredMilestone.
 *
 * Mirrors the exact conditions in PactFlow.sol lines 313–321:
 *   require(msg.sender == agreement.funder)          NotFunder
 *   require(agreement.status == Active)              AgreementNotActive  (via _requireActive)
 *   require(agreement.isFunded)                      AgreementNotFunded
 *   require(milestone.status == Pending)             MilestoneNotPending
 *   require(milestone.deadline > 0
 *        && block.timestamp > milestone.deadline)    DeadlineNotPassed
 *
 * @param role          - The connected wallet's role in this agreement
 * @param isActive      - agreement.status === Active
 * @param isFunded      - agreement.isFunded
 * @param milestoneStatus  - milestone.status (as number)
 * @param deadline      - milestone.deadline as Unix seconds (number, 0 if unset)
 * @param nowTs         - current Unix timestamp in seconds
 */
export function canClaimExpiredMilestone(
  role: 'funder' | 'builder' | 'arbitrator' | 'observer' | null,
  isActive: boolean,
  isFunded: boolean,
  milestoneStatus: number,
  deadline: number,
  nowTs: number,
): boolean {
  if (role !== 'funder')   return false // NotFunder
  if (!isActive)           return false // AgreementNotActive
  if (!isFunded)           return false // AgreementNotFunded
  if (milestoneStatus !== 0) return false // MilestoneNotPending (0 = Pending)
  if (deadline === 0)      return false // DeadlineNotPassed (deadline must be > 0)
  if (nowTs <= deadline)   return false // DeadlineNotPassed (must be strictly past)
  return true
}
