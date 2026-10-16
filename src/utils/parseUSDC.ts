/**
 * Pure string-to-bigint USDC parser — no floating-point multiplication.
 *
 * Parses a decimal string such as "1.50" directly into micro-USDC bigint
 * (6 decimal places) without going through parseFloat, which loses precision
 * for long fractional strings.
 *
 * Returns 0n for any input that is invalid, zero, negative, or has more than
 * 6 decimal places (unsupported precision).
 *
 * Note on limits: the 1 micro-USDC minimum and 1,000,000 USDC maximum are
 * FRONTEND POLICIES only — the deployed PactFlow contract enforces only
 * amount > 0 (InvalidMilestoneAmount). The 1M cap exists to prevent obvious
 * data-entry errors in the UI; it is not a contract requirement.
 */
export const USDC_DECIMALS = 6
export const MIN_USDC_RAW  = 1n                    // 0.000001 USDC  — frontend policy
export const MAX_USDC_RAW  = 1_000_000_000_000n    // 1,000,000 USDC — frontend policy

export type ParseResult =
  | { ok: true;  value: bigint }
  | { ok: false; reason: 'empty' | 'invalid' | 'negative' | 'zero' | 'too_small' | 'too_large' | 'too_many_decimals' }

/**
 * Parse a USDC decimal string into a bigint without floating-point arithmetic.
 * Returns a discriminated union so callers can surface specific errors.
 */
export function parseUSDCExact(input: string): ParseResult {
  const s = input.trim()
  if (!s) return { ok: false, reason: 'empty' }

  // Allow an optional leading minus to give a clear error
  if (s.startsWith('-')) return { ok: false, reason: 'negative' }

  // Must match: optional digits, optional dot followed by digits, nothing else
  if (!/^\d*\.?\d+$/.test(s) && !/^\d+\.?\d*$/.test(s)) {
    return { ok: false, reason: 'invalid' }
  }

  const dotIdx = s.indexOf('.')
  let intPart: string
  let fracPart: string

  if (dotIdx === -1) {
    intPart  = s
    fracPart = ''
  } else {
    intPart  = s.slice(0, dotIdx)
    fracPart = s.slice(dotIdx + 1)
  }

  if (fracPart.length > USDC_DECIMALS) {
    return { ok: false, reason: 'too_many_decimals' }
  }

  // Pad fractional part to exactly USDC_DECIMALS digits
  const fracPadded = fracPart.padEnd(USDC_DECIMALS, '0')

  // Combine: "1" + "500000" = "1500000"
  const combined = (intPart || '0') + fracPadded

  // Remove leading zeros to avoid BigInt('007') confusion
  const stripped = combined.replace(/^0+/, '') || '0'

  const value = BigInt(stripped)

  if (value === 0n)            return { ok: false, reason: 'zero' }
  if (value < MIN_USDC_RAW)   return { ok: false, reason: 'too_small' }
  if (value > MAX_USDC_RAW)   return { ok: false, reason: 'too_large' }

  return { ok: true, value }
}

/**
 * Simple wrapper — returns bigint or 0n for invalid input.
 * Use parseUSDCExact for field-level error messages.
 */
export function parseUSDC(input: string): bigint {
  const r = parseUSDCExact(input)
  return r.ok ? r.value : 0n
}

/** Human-readable error from a ParseResult for field-level display. */
export function parseUSDCError(r: ParseResult): string | null {
  if (r.ok) return null
  switch (r.reason) {
    case 'empty':            return 'Amount is required'
    case 'invalid':          return 'Enter a valid number'
    case 'negative':         return 'Amount must be positive'
    case 'zero':             return 'Amount must be greater than zero'
    case 'too_small':        return 'Minimum amount is 0.000001 USDC'
    case 'too_many_decimals':return 'USDC supports at most 6 decimal places'
    case 'too_large':        return 'Amount exceeds the 1,000,000 USDC limit (frontend policy — the contract has no maximum)'
  }
}
