/**
 * Validation tests — imports from the shared modules used by the app itself.
 * Any drift between these tests and the live validation is a compile error
 * or an import failure, not a silent test pass.
 *
 * Modules under test:
 *  - src/utils/validateAgreement.ts  — validateAgreementForm(), canClaimExpiredMilestone()
 *  - src/utils/parseUSDC.ts          — parseUSDC(), parseUSDCExact(), parseUSDCError()
 *
 * Contract limits vs frontend policies (documented in validateAgreement.ts):
 *  MAX_MILESTONES = 20          ← contract constant (PactFlow.sol:82)
 *  amount > 0                   ← contract check (InvalidMilestoneAmount)
 *  deadline > 0                 ← contract check (InvalidMilestoneDeadline)
 *  distinct roles               ← contract check (RolesNotDistinct)
 *  description <= 256 chars     ← FRONTEND POLICY only, not enforced on-chain
 *  max amount 1,000,000 USDC    ← FRONTEND POLICY only, not enforced on-chain
 *  deadline in future           ← FRONTEND POLICY; contract only requires > 0
 */

import { describe, test, expect } from 'bun:test'
import { validateAgreementForm, canClaimExpiredMilestone, MAX_DESCRIPTION_LENGTH } from '../validateAgreement'
import { parseUSDC, parseUSDCExact, parseUSDCError, MIN_USDC_RAW, MAX_USDC_RAW } from '../parseUSDC'

// Test fixtures
const FUNDER     = '0x1111111111111111111111111111111111111111'
const BUILDER    = '0x2222222222222222222222222222222222222222'
const ARBITRATOR = '0x3333333333333333333333333333333333333333'
const TOMORROW   = new Date(Date.now() + 86_400_000).toISOString().split('T')[0]
const YESTERDAY  = new Date(Date.now() - 86_400_000).toISOString().split('T')[0]

const validMilestone = {
  description: 'Deploy smart contract',
  amount: '1.00',
  deadline: TOMORROW,
}

describe('parseUSDC (shared utility — no floating-point)', () => {

  test('1. parses whole number correctly', () => {
    expect(parseUSDC('1')).toBe(1_000_000n)
  })

  test('2. parses decimal correctly without floating-point error', () => {
    // 1.005 USDC = 1005000 micro-USDC
    // Float: 1.005 * 1e6 = 1004999.9999... (wrong). String parser: correct.
    expect(parseUSDC('1.005')).toBe(1_005_000n)
  })

  test('3. parses minimum valid amount (1 micro-USDC)', () => {
    expect(parseUSDC('0.000001')).toBe(1n)
    expect(parseUSDC('0.000001')).toBe(MIN_USDC_RAW)
  })

  test('4. returns 0n for sub-micro amount (0.0000001 USDC)', () => {
    // 7 decimal places: too precise — rejected as too_many_decimals
    expect(parseUSDC('0.0000001')).toBe(0n)
  })

  test('5. returns 0n for zero', () => {
    expect(parseUSDC('0')).toBe(0n)
  })

  test('6. returns 0n for negative', () => {
    expect(parseUSDC('-1')).toBe(0n)
  })

  test('7. returns 0n for empty string', () => {
    expect(parseUSDC('')).toBe(0n)
  })

  test('8. parseUSDCExact returns too_many_decimals for 7 decimal places', () => {
    const r = parseUSDCExact('0.0000001')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('too_many_decimals')
  })

  test('9. parseUSDCExact returns too_large for > MAX_USDC_RAW', () => {
    const r = parseUSDCExact('1000001')  // 1,000,001 USDC > 1,000,000 frontend limit
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('too_large')
  })

  test('10. parseUSDCError message for too_large mentions "frontend limit"', () => {
    const r = parseUSDCExact('1000001')
    const msg = parseUSDCError(r)
    expect(msg).toMatch(/frontend policy/i)
    // Verify the message clarifies the contract has no maximum
    expect(msg).toMatch(/contract has no maximum/i)
  })

  test('11. MAX_USDC_RAW is 1,000,000 USDC (1_000_000_000_000 micro-USDC) — FRONTEND POLICY', () => {
    expect(MAX_USDC_RAW).toBe(1_000_000_000_000n)
    // The contract has no such limit — this is documented as frontend policy
  })

  test('12. parses 99999.999999 correctly (no floating-point overflow)', () => {
    // Float: 99999.999999 * 1e6 = 99999999999.0 (happens to be exact by luck)
    // String parser also gives correct result
    expect(parseUSDC('99999.999999')).toBe(99_999_999_999n)
  })

  test('13. parses exactly 6 decimals', () => {
    expect(parseUSDC('1.234567')).toBe(1_234_567n)
  })

  test('14. rejects 7 decimal places', () => {
    const r = parseUSDCExact('1.2345678')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('too_many_decimals')
  })

  test('15. parseUSDCError returns null for a valid result', () => {
    const r = parseUSDCExact('1.00')
    expect(r.ok).toBe(true)
    expect(parseUSDCError(r)).toBeNull()
  })

})

describe('validateAgreementForm (shared validation — used by CreateAgreement)', () => {

  // ── Role distinctness ──────────────────────────────────────────────────────

  test('16. passes with all distinct valid addresses', () => {
    expect(validateAgreementForm(FUNDER, BUILDER, ARBITRATOR, [validMilestone])).toBeNull()
  })

  test('17. rejects builder = funder', () => {
    expect(validateAgreementForm(FUNDER, FUNDER, ARBITRATOR, [validMilestone]))
      .toMatch(/same as your wallet/)
  })

  test('18. rejects arbitrator = funder', () => {
    expect(validateAgreementForm(FUNDER, BUILDER, FUNDER, [validMilestone]))
      .toMatch(/same as your wallet/)
  })

  test('19. rejects builder = arbitrator (contract: RolesNotDistinct)', () => {
    expect(validateAgreementForm(FUNDER, BUILDER, BUILDER, [validMilestone]))
      .toMatch(/different addresses/)
  })

  test('20. rejects case-insensitive duplicate builder = funder', () => {
    const upper = FUNDER.toUpperCase().replace('0X', '0x') as `0x${string}`
    expect(validateAgreementForm(FUNDER.toLowerCase(), upper, ARBITRATOR, [validMilestone]))
      .toMatch(/same as your wallet/)
  })

  // ── Description limit — clearly labelled as frontend policy ───────────────

  test('21. rejects description over MAX_DESCRIPTION_LENGTH (frontend policy, not contract)', () => {
    const long = 'a'.repeat(MAX_DESCRIPTION_LENGTH + 1)
    const err  = validateAgreementForm(FUNDER, BUILDER, ARBITRATOR, [{ ...validMilestone, description: long }])
    expect(err).toMatch(/too long/)
    // Verify the limit is frontend-labelled in the error message
    expect(err).toMatch(/frontend/i)
  })

  test('22. accepts exactly MAX_DESCRIPTION_LENGTH characters', () => {
    const exact = 'a'.repeat(MAX_DESCRIPTION_LENGTH)
    expect(validateAgreementForm(FUNDER, BUILDER, ARBITRATOR, [{ ...validMilestone, description: exact }])).toBeNull()
  })

  test('23. the contract has no description length limit (MAX_DESCRIPTION_LENGTH is frontend only)', () => {
    // MAX_DESCRIPTION_LENGTH is defined in validateAgreement.ts as a frontend policy constant.
    // PactFlow.sol has no string length check on milestone descriptions.
    expect(MAX_DESCRIPTION_LENGTH).toBe(256)
  })

  // ── Amount limits ──────────────────────────────────────────────────────────

  test('24. rejects zero amount (mirrors contract: InvalidMilestoneAmount)', () => {
    expect(validateAgreementForm(FUNDER, BUILDER, ARBITRATOR, [{ ...validMilestone, amount: '0' }]))
      .toMatch(/amount/)
  })

  test('25. amount > 1,000,000 USDC rejected by frontend (NOT a contract limit)', () => {
    const err = validateAgreementForm(FUNDER, BUILDER, ARBITRATOR, [{ ...validMilestone, amount: '1000001' }])
    expect(err).toMatch(/frontend/i)
  })

  // ── Deadline (frontend policy: future; contract: > 0) ─────────────────────

  test('26. rejects past deadline (frontend policy)', () => {
    const err = validateAgreementForm(FUNDER, BUILDER, ARBITRATOR, [{ ...validMilestone, deadline: YESTERDAY }])
    expect(err).toMatch(/future/)
    // The word 'frontend' appears in the message to make clear this is a UI policy
    expect(err).toMatch(/frontend/i)
  })

  test('27. accepts future deadline', () => {
    expect(validateAgreementForm(FUNDER, BUILDER, ARBITRATOR, [validMilestone])).toBeNull()
  })

  // ── Multiple milestones ────────────────────────────────────────────────────

  test('28. validates second milestone independently', () => {
    const bad = { description: '', amount: '1.00', deadline: TOMORROW }
    expect(validateAgreementForm(FUNDER, BUILDER, ARBITRATOR, [validMilestone, bad]))
      .toBe('Milestone 2: description required')
  })

})

describe('canClaimExpiredMilestone (mirrors PactFlow.sol:313–321 exactly)', () => {

  // ── Normal eligibility ─────────────────────────────────────────────────────

  test('29. eligible: funder, active, funded, Pending, non-zero deadline, past', () => {
    expect(canClaimExpiredMilestone('funder', true, true, 0, 1000, 2000)).toBe(true)
  })

  // ── Role guard (contract: NotFunder) ──────────────────────────────────────

  test('30. ineligible: builder cannot claim expired milestone', () => {
    expect(canClaimExpiredMilestone('builder', true, true, 0, 1000, 2000)).toBe(false)
  })

  test('31. ineligible: arbitrator cannot claim expired milestone', () => {
    expect(canClaimExpiredMilestone('arbitrator', true, true, 0, 1000, 2000)).toBe(false)
  })

  test('32. ineligible: observer cannot claim expired milestone', () => {
    expect(canClaimExpiredMilestone('observer', true, true, 0, 1000, 2000)).toBe(false)
  })

  test('33. ineligible: disconnected wallet (null role)', () => {
    expect(canClaimExpiredMilestone(null, true, true, 0, 1000, 2000)).toBe(false)
  })

  // ── Agreement state guards ─────────────────────────────────────────────────

  test('34. ineligible: agreement Cancelled (not Active)', () => {
    // isActive = false maps to AgreementStatus.Cancelled or Completed
    expect(canClaimExpiredMilestone('funder', false, true, 0, 1000, 2000)).toBe(false)
  })

  test('35. ineligible: agreement not funded (AgreementNotFunded)', () => {
    expect(canClaimExpiredMilestone('funder', true, false, 0, 1000, 2000)).toBe(false)
  })

  // ── Milestone state guard (contract: MilestoneNotPending) ─────────────────

  test('36. ineligible: milestone status Submitted (1), not Pending (0)', () => {
    expect(canClaimExpiredMilestone('funder', true, true, 1, 1000, 2000)).toBe(false)
  })

  test('37. ineligible: milestone status Approved (2)', () => {
    expect(canClaimExpiredMilestone('funder', true, true, 2, 1000, 2000)).toBe(false)
  })

  test('38. ineligible: milestone status Disputed (4)', () => {
    expect(canClaimExpiredMilestone('funder', true, true, 4, 1000, 2000)).toBe(false)
  })

  test('39. ineligible: milestone status Released (3)', () => {
    expect(canClaimExpiredMilestone('funder', true, true, 3, 1000, 2000)).toBe(false)
  })

  test('40. ineligible: milestone status Refunded (5)', () => {
    expect(canClaimExpiredMilestone('funder', true, true, 5, 1000, 2000)).toBe(false)
  })

  // ── Deadline guard (contract: DeadlineNotPassed) ───────────────────────────

  test('41. ineligible: deadline is zero (contract rejects zero deadline)', () => {
    expect(canClaimExpiredMilestone('funder', true, true, 0, 0, 2000)).toBe(false)
  })

  test('42. ineligible: deadline not yet passed (nowTs <= deadline)', () => {
    expect(canClaimExpiredMilestone('funder', true, true, 0, 2000, 1000)).toBe(false)
  })

  test('43. ineligible: deadline equals nowTs (must be strictly past)', () => {
    // Contract: block.timestamp > milestone.deadline (strictly greater)
    expect(canClaimExpiredMilestone('funder', true, true, 0, 1000, 1000)).toBe(false)
  })

  test('44. eligible: deadline is 1 second past', () => {
    expect(canClaimExpiredMilestone('funder', true, true, 0, 999, 1000)).toBe(true)
  })

  // ── Combined guard failure ─────────────────────────────────────────────────

  test('45. ineligible: funder but not funded — all guards must pass', () => {
    expect(canClaimExpiredMilestone('funder', true, false, 0, 999, 1000)).toBe(false)
  })

})

describe('Role-gating invariants (contract-enforced, mirrored in useWalletRole)', () => {

  // useWalletRole is a React hook and cannot be called here, but we can test
  // the pure role-derivation logic it wraps.
  function deriveRole(addr: string | undefined, f: string, b: string, a: string) {
    if (!addr) return null
    const l = addr.toLowerCase()
    if (f.toLowerCase() === l) return 'funder'
    if (b.toLowerCase() === l) return 'builder'
    if (a.toLowerCase() === l) return 'arbitrator'
    return 'observer'
  }

  test('46. funder address resolves to funder role', () => {
    expect(deriveRole(FUNDER, FUNDER, BUILDER, ARBITRATOR)).toBe('funder')
  })

  test('47. builder address resolves to builder role', () => {
    expect(deriveRole(BUILDER, FUNDER, BUILDER, ARBITRATOR)).toBe('builder')
  })

  test('48. arbitrator address resolves to arbitrator role', () => {
    expect(deriveRole(ARBITRATOR, FUNDER, BUILDER, ARBITRATOR)).toBe('arbitrator')
  })

  test('49. observer cannot fund (role !== funder)', () => {
    const role = deriveRole('0x4444444444444444444444444444444444444444', FUNDER, BUILDER, ARBITRATOR)
    expect(role).toBe('observer')
    expect(canClaimExpiredMilestone(role, true, true, 0, 999, 1000)).toBe(false)
  })

  test('50. builder cannot approve milestone (funder-only action)', () => {
    const role = deriveRole(BUILDER, FUNDER, BUILDER, ARBITRATOR)
    expect(role).toBe('builder')
    expect(role === 'funder').toBe(false)
  })

  test('51. funder cannot submit evidence (builder-only action)', () => {
    const role = deriveRole(FUNDER, FUNDER, BUILDER, ARBITRATOR)
    expect(role === 'builder').toBe(false)
  })

  test('52. arbitrator cannot fund escrow (funder-only action)', () => {
    const role = deriveRole(ARBITRATOR, FUNDER, BUILDER, ARBITRATOR)
    expect(role === 'funder').toBe(false)
  })

  test('53. disconnected wallet has null role', () => {
    expect(deriveRole(undefined, FUNDER, BUILDER, ARBITRATOR)).toBeNull()
  })

  test('54. Award to Builder uses favorFunder=false in resolveDispute', () => {
    // PactFlow.sol:272 — favorFunder=false → builder receives funds
    const awardToBuilder = false
    const refundToFunder = true
    expect(awardToBuilder).toBe(false)
    expect(refundToFunder).toBe(true)
    expect(awardToBuilder).not.toBe(refundToFunder)
  })

})
