import { formatUnits } from 'viem'
import { USDC_DECIMALS } from '@/contracts/pactflow'

// Returns '—' when raw is undefined/null — callers must not default to 0.
// Returns a formatted number string when raw is a bigint.
export function formatUSDC(raw: bigint | undefined | null): string {
  if (raw === undefined || raw === null) return '—'
  const n = parseFloat(formatUnits(raw, USDC_DECIMALS))
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

// Like formatUSDC but returns '0.00' for undefined/null — use only for
// display contexts where a zero is meaningful (e.g. totals that have loaded).
export function formatUSDCOrZero(raw: bigint | undefined | null): string {
  if (raw === undefined || raw === null) return '0.00'
  return formatUSDC(raw)
}

// Re-exported from parseUSDC.ts — the canonical bigint parser.
// Use parseUSDCExact() for field-level error messages.
export { parseUSDC, parseUSDCExact, parseUSDCError } from './parseUSDC'

export function shortenAddress(addr: string | undefined | null): string {
  if (!addr || typeof addr !== 'string' || addr.length < 10) return addr ?? '—'
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export function formatTimestamp(ts: number): string {
  if (ts === 0) return '—'
  return new Date(ts * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function parseOnchainError(error: unknown): string {
  const msg = (error as { message?: string })?.message?.toLowerCase() ?? ''
  if (msg.includes('user rejected') || msg.includes('user denied')) return 'Transaction cancelled.'
  if (msg.includes('insufficient funds') || msg.includes('exceeds balance')) return 'Insufficient USDC balance.'
  if (msg.includes('notfunder')) return 'Only the funder can do this.'
  if (msg.includes('notbuilder')) return 'Only the builder can do this.'
  if (msg.includes('notarbitrator')) return 'Only the arbitrator can do this.'
  if (msg.includes('alreadyreleased')) return 'Funds already released for this milestone.'
  if (msg.includes('invalidmilestonestate')) return 'This action is not valid for the milestone\'s current state.'
  if (msg.includes('agreementnotfunded')) return 'Agreement must be funded first.'
  if (msg.includes('cancellationnotallowed')) return 'Cannot cancel: active milestones exist.'
  if (msg.includes('deadlinenotpassed')) return 'Milestone deadline has not passed yet.'
  if (msg.includes('nothingtowithdraw')) return 'No funds available to withdraw.'
  if (msg.includes('rolesnotdistinct')) return 'Funder, builder and arbitrator must be different addresses.'
  if (msg.includes('tokennotallowed')) return 'Only USDC is accepted for this contract.'
  if (msg.includes('reverted')) return 'Transaction failed. Check the milestone state and try again.'
  if (msg.includes('network') || msg.includes('timeout')) return 'Network error. Please retry.'
  return 'Something went wrong. Please try again.'
}
