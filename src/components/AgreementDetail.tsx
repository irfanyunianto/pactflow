import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, ExternalLink, AlertTriangle, CheckCircle2,
  Clock, Wallet2, Shield, ChevronDown, ChevronUp, Link2,
  RefreshCw, CircleDot, Loader2, Copy, Check,
} from 'lucide-react'
import { useAccount } from 'wagmi'
import { toast } from 'sonner'

import {
  useAgreement, useMilestone, useMilestoneCount,
  useAgreementBalance, usePendingWithdrawals,
  useFundAgreement, useApproveUSDC,
  useSubmitEvidence, useApproveMilestone, useReleaseMilestone,
  useRaiseDispute, useResolveDispute, useCancelAgreement,
  useClaimExpiredMilestone,
  useWithdraw, useWalletRole, useUSDCAllowance, useUSDCBalance,
  useRefetchGroup,
} from '@/hooks/usePactFlow'
import type { RefetchFn, PostconditionFn } from '@/hooks/usePactFlow'
import { useNow } from '@/hooks/useNow'
import { canClaimExpiredMilestone } from '@/utils/validateAgreement'
import {
  checkSubmit, checkApprove, checkDispute, checkRelease, checkRefund,
} from '@/utils/milestonePostconditions'
import type { MilestoneCheck } from '@/utils/milestonePostconditions'

import { milestoneStatusBadge, agreementStatusBadge } from '@/components/ui/Badge'
import { TxButton } from '@/components/ui/TxButton'
import { TxReceipt } from '@/components/ui/TxReceipt'
import { formatUSDC, formatUSDCOrZero, shortenAddress, formatTimestamp } from '@/utils/format'
import { AgreementStatus, MilestoneStatus, buildAddressUrl, PACTFLOW_ADDRESS } from '@/contracts/pactflow'
import type { AgreementData, MilestoneData } from '@/types/pactflow'
import { ResolutionDial, MilestoneRail } from '@/components/visuals/ProtocolVisuals'


// SyncState drives the SyncingBanner.
// 'idle'      — no sync in progress; banner hidden.
// 'syncing'   — refetches in flight; show spinner.
// 'exhausted' — all retries fired, postcondition never passed; show "not yet
//               updated" warning with a Retry button.
type SyncState = 'idle' | 'syncing' | 'exhausted'

const MS = {
  Pending:   Number(MilestoneStatus.Pending),
  Submitted: Number(MilestoneStatus.Submitted),
  Approved:  Number(MilestoneStatus.Approved),
  Released:  Number(MilestoneStatus.Released),
  Disputed:  Number(MilestoneStatus.Disputed),
  Refunded:  Number(MilestoneStatus.Refunded),
} as const

// ── Role pill ─────────────────────────────────────────────────────────────────
const ROLE_COLORS = {
  funder:     { bg: 'var(--surface-muted)', border: 'rgba(53,49,70,0.2)', text: '#ccc1d8' },
  builder:    { bg: 'rgba(93,74,184,0.09)', border: 'rgba(93,74,184,0.25)', text: '#c9aff6' },
  arbitrator: { bg: 'rgba(162,82,36,0.08)', border: 'rgba(162,82,36,0.24)', text: '#e5b07e' },
  observer:   { bg: 'var(--surface)',          border: 'var(--border)',          text: 'var(--subtle)' },
}

function RolePill({ role }: { role: 'funder' | 'builder' | 'arbitrator' | 'observer' }) {
  const c = ROLE_COLORS[role]
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold"
      style={{ background: c.bg, borderColor: c.border, color: c.text }}
    >
      <CircleDot className="size-2.5" />
      Your role: {role.charAt(0).toUpperCase() + role.slice(1)}
    </span>
  )
}

// ── Milestone timeline dot ─────────────────────────────────────────────────────
function TimelineDot({ status, isLast, index }: { status: MilestoneStatus | number; isLast: boolean; index: bigint }) {
  const s = Number(status)
  const color =
    s === MS.Released  ? 'var(--success)'  :
    s === MS.Disputed  ? 'var(--warning)'  :
    s === MS.Refunded  ? 'var(--subtle)'   :
    s === MS.Approved  ? 'var(--accent)'   :
    s === MS.Submitted ? 'var(--violet)'   :
    'var(--border-strong)'
  return (
    <div className="relative flex shrink-0 flex-col items-center" style={{ width: 30 }}>
      <div
        key={s}
        data-active={s === MS.Submitted || s === MS.Approved}
        className="timeline-status relative z-10 flex size-[30px] items-center justify-center rounded-md border font-mono text-[9px] font-semibold"
        style={{ background: 'var(--paper)', borderColor: color, color }}
      >
        {(s === MS.Released || s === MS.Refunded) && <CheckCircle2 className="size-3" style={{ color }} />}
        {s === MS.Disputed && <AlertTriangle className="size-2.5" style={{ color }} />}
        {s !== MS.Released && s !== MS.Refunded && s !== MS.Disputed && String(Number(index) + 1).padStart(2, '0')}
      </div>
      {!isLast && <div className="mt-1 w-px flex-1" style={{ background: 'linear-gradient(var(--border-strong), var(--border))', minHeight: 24 }} />}
    </div>
  )
}

// ── Syncing banner ─────────────────────────────────────────────────────────────
interface SyncingBannerProps {
  state: SyncState
  onRetry: () => void
}
function SyncingBanner({ state, onRetry }: SyncingBannerProps) {
  return (
    <AnimatePresence mode="wait">
      {state === 'syncing' && (
        <motion.div
          key="syncing"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
          className="mb-3 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs"
          style={{ background: 'var(--accent-glow)', borderColor: 'rgba(93,74,184,0.2)', color: 'var(--muted)' }}
        >
          <Loader2 className="size-3 shrink-0 animate-spin" style={{ color: 'var(--accent)' }} />
          Updating balances…
        </motion.div>
      )}
      {state === 'exhausted' && (
        <motion.div
          key="exhausted"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
          className="mb-3 flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-xs"
          style={{ background: 'var(--warning-bg)', borderColor: 'var(--warning-border)', color: 'var(--ink-2)' }}
        >
          <span className="flex items-center gap-2">
            <AlertTriangle className="size-3 shrink-0" style={{ color: 'var(--warning)' }} />
            Transaction confirmed; balances not yet updated.
          </span>
          <button
            onClick={onRetry}
            className="flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors hover:bg-white/5"
            style={{ borderColor: 'var(--warning-border)', color: 'var(--warning)' }}
          >
            <RefreshCw className="size-3" />
            Retry
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// Shown when a background refresh (triggered by onTxConfirmed) detects read failures.
// Only rendered when syncState === 'idle' so it never competes with the tx-verification
// banner. The retry re-runs refreshOnce (no postcondition — purely re-reads).
interface RefreshErrorBannerProps { show: boolean; onRetry: () => void }
function RefreshErrorBanner({ show, onRetry }: RefreshErrorBannerProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="refresh-error"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
          className="mb-3 flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-xs"
          style={{ background: 'var(--danger-bg)', borderColor: 'var(--danger-border)', color: 'var(--ink-2)' }}
        >
          <span className="flex items-center gap-2">
            <AlertTriangle className="size-3 shrink-0" style={{ color: 'var(--danger)' }} />
            Could not refresh data — one or more reads failed.
          </span>
          <button
            onClick={onRetry}
            className="flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors hover:bg-white/5"
            style={{ borderColor: 'var(--danger-border)', color: 'var(--danger)' }}
          >
            <RefreshCw className="size-3" />
            Retry
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ── Milestone row ─────────────────────────────────────────────────────────────
interface MilestoneRowProps {
  agreementId: bigint
  milestoneIndex: bigint
  isLast: boolean
  role: 'funder' | 'builder' | 'arbitrator' | 'observer' | null
  isFunded: boolean
  agreementActive: boolean
  cancelledUnfunded: boolean
  parentBusy: boolean             // true while any agreement-level tx is in-flight
  onTxConfirmed: () => Promise<void>  // fire-and-refresh: parent re-reads agreement+balances; no postcondition
}

function MilestoneRow({
  agreementId, milestoneIndex, isLast, role, isFunded, agreementActive,
  cancelledUnfunded, parentBusy, onTxConfirmed,
}: MilestoneRowProps) {
  const { address, chainId } = useAccount()
  const { data: milestoneRaw, isLoading, refetch: _refetchMilestone } = useMilestone(agreementId, milestoneIndex)
  const refetchMilestone = _refetchMilestone as RefetchFn
  const [expanded, setExpanded]       = useState(false)
  const [evidenceUrl, setEvidenceUrl] = useState('')
  const [syncState, setSyncState]     = useState<SyncState>('idle')

  const submitEv    = useSubmitEvidence()
  const approveMi   = useApproveMilestone()
  const releaseMi   = useReleaseMilestone()
  const raiseDisp   = useRaiseDispute()
  const resolveDisp = useResolveDispute()
  const claimExp    = useClaimExpiredMilestone()
  // Live clock — updates every 60s so deadline-based eligibility flips correctly.
  const nowTs       = useNow()

  // ── Results ref ───────────────────────────────────────────────────────────
  // Written synchronously inside wrappedRefetch's .then() handler, which runs
  // BEFORE retryRefetch's check() microtask. This guarantees check() reads
  // post-refetch values, not stale React state.
  const milestoneResultRef = useRef<{ status: number | undefined; evidenceUrl: string | undefined }>({
    status: undefined, evidenceUrl: undefined,
  })

  const wrappedRefetch = useCallback((): Promise<unknown> =>
    (refetchMilestone as () => Promise<{ data?: unknown }>)()
      .then(res => {
        const d = (res?.data) as MilestoneData | undefined
        // Always overwrite — a successful read with d===undefined clears prior results.
        milestoneResultRef.current = {
          status:      d !== undefined ? Number(d.status)            : undefined,
          evidenceUrl: d !== undefined ? String(d.evidenceUrl ?? '') : undefined,
        }
      })
      .catch(() => {
        // Failed read: clear both fields so a stale prior-attempt result
        // cannot satisfy a postcondition on a later attempt.
        milestoneResultRef.current = { status: undefined, evidenceUrl: undefined }
      }),
  [refetchMilestone])

  const { syncAll: syncMilestone, abort: abortMilestoneSync } = useRefetchGroup(
    [wrappedRefetch],
    { maxAttempts: 4, intervalMs: 1500 },
  )

  // ── Sync-ordering guard ────────────────────────────────────────────────────
  const syncGenRef              = useRef(0)
  // Persisted postcondition — Retry reuses the last confirmed tx's check.
  const currentCheckRef         = useRef<MilestoneCheck | undefined>(undefined)
  // Per-action pending-flag refs (leading-edge detection in effects).
  const prevS = useRef({ sub: false, appr: false, rel: false, raise: false, res: false, exp: false })
  // Pending check to fire once the tx confirms — set in onClick, consumed in isSuccess effect.
  const pendingCheckRef         = useRef<MilestoneCheck | undefined>(undefined)

  // ── handleTxConfirmed ─────────────────────────────────────────────────────
  // Called by each isSuccess effect with the action-specific check built in onClick.
  // Action-specific checks (from milestonePostconditions.ts):
  //   Submit  → checkSubmit(submittedUrl): status===Submitted && url matches
  //   Approve → checkApprove():            status===Approved
  //   Dispute → checkDispute():            status===Disputed
  //   Release → checkRelease():            status===Released
  //   Refund  → checkRefund():             status===Refunded
  //   Expire  → checkRefund():             status===Refunded
  // The check reads milestoneResultRef (written by wrappedRefetch BEFORE
  // retryRefetch's check() microtask fires) — never from React state.
  const handleTxConfirmed = useCallback(async (check: MilestoneCheck) => {
    const gen = ++syncGenRef.current
    // Wrap MilestoneCheck in a PostconditionFn that reads from milestoneResultRef.
    const postcondition: PostconditionFn = () => check(milestoneResultRef.current)
    currentCheckRef.current = check
    setSyncState('syncing')
    const result = await syncMilestone(postcondition)
    if (gen !== syncGenRef.current) return   // superseded — never clobber newer state
    if (result !== 'cancelled') {
      setSyncState(result === 'fresh' ? 'idle' : 'exhausted')
    }
    // Parent fire-and-refresh (no postcondition — agreement reads, not milestone).
    // Not awaited so milestone sync state is already settled when this fires.
    if (result !== 'cancelled') {
      void onTxConfirmed()
    }
  }, [syncMilestone, onTxConfirmed])

  // Retry reuses currentCheckRef — same postcondition as the last confirmed tx.
  const handleRetry = useCallback(async () => {
    const gen = ++syncGenRef.current
    setSyncState('syncing')
    const postcondition = currentCheckRef.current
      ? (() => { const ch = currentCheckRef.current; return () => ch(milestoneResultRef.current) })()
      : undefined
    const result = await syncMilestone(postcondition)
    if (gen !== syncGenRef.current) return
    if (result !== 'cancelled') setSyncState(result === 'fresh' ? 'idle' : 'exhausted')
  }, [syncMilestone])

  // ── Identity-change reset ─────────────────────────────────────────────────
  // Abort in-flight sync, advance the generation counter (so any settled
  // result from the old identity is rejected by the gen guard), and clear
  // all per-identity state. The component already remounts on agreementId+idx
  // change (key in parent), so this only needs to handle wallet/chain changes.
  useEffect(() => {
    abortMilestoneSync()          // cancel any in-flight retryRefetch loop
    syncGenRef.current++          // invalidate any result about to write state
    pendingCheckRef.current  = undefined
    currentCheckRef.current  = undefined
    milestoneResultRef.current = { status: undefined, evidenceUrl: undefined }
    setSyncState('idle')          // clear any banner left from the old identity
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, chainId])

  // ── isSuccess effects ─────────────────────────────────────────────────────
  // Each effect fires on leading edge of isSuccess and passes the pendingCheckRef
  // that was set in the corresponding onClick BEFORE writeContract was called.
  // This guarantees the check was constructed with pre-tx context (evidenceUrl,
  // expected status), not post-tx React state.
  useEffect(() => {
    if (submitEv.isSuccess && !prevS.current.sub) {
      prevS.current.sub = true
      if (pendingCheckRef.current) void handleTxConfirmed(pendingCheckRef.current)
    }
    if (!submitEv.isSuccess) prevS.current.sub = false
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitEv.isSuccess, handleTxConfirmed])
  useEffect(() => {
    if (approveMi.isSuccess && !prevS.current.appr) {
      prevS.current.appr = true
      if (pendingCheckRef.current) void handleTxConfirmed(pendingCheckRef.current)
    }
    if (!approveMi.isSuccess) prevS.current.appr = false
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveMi.isSuccess, handleTxConfirmed])
  useEffect(() => {
    if (releaseMi.isSuccess && !prevS.current.rel) {
      prevS.current.rel = true
      if (pendingCheckRef.current) void handleTxConfirmed(pendingCheckRef.current)
    }
    if (!releaseMi.isSuccess) prevS.current.rel = false
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [releaseMi.isSuccess, handleTxConfirmed])
  useEffect(() => {
    if (raiseDisp.isSuccess && !prevS.current.raise) {
      prevS.current.raise = true
      if (pendingCheckRef.current) void handleTxConfirmed(pendingCheckRef.current)
    }
    if (!raiseDisp.isSuccess) prevS.current.raise = false
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raiseDisp.isSuccess, handleTxConfirmed])
  useEffect(() => {
    if (resolveDisp.isSuccess && !prevS.current.res) {
      prevS.current.res = true
      if (pendingCheckRef.current) void handleTxConfirmed(pendingCheckRef.current)
    }
    if (!resolveDisp.isSuccess) prevS.current.res = false
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolveDisp.isSuccess, handleTxConfirmed])
  useEffect(() => {
    if (claimExp.isSuccess && !prevS.current.exp) {
      prevS.current.exp = true
      if (pendingCheckRef.current) void handleTxConfirmed(pendingCheckRef.current)
    }
    if (!claimExp.isSuccess) prevS.current.exp = false
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimExp.isSuccess, handleTxConfirmed])

  if (isLoading) return <div className="skeleton h-24 rounded-2xl" />

  const ms = milestoneRaw as MilestoneData | undefined
  if (!ms || typeof ms !== 'object' || !('description' in ms)) {
    return (
      <div className="flex items-center gap-2 rounded-xl border px-4 py-3 text-sm"
        style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--muted)' }}>
        <RefreshCw className="size-3.5 animate-spin opacity-50" /> Loading…
      </div>
    )
  }

  const {
    description, amount = 0n, deadline = 0n,
    status: rawStatus, evidenceUrl: evidenceUrlOnchain = '', fundsReleased = false,
  } = ms
  const status    = rawStatus as MilestoneStatus
  const deadlineTs = Number(deadline)
  const isPast    = deadlineTs > 0 && deadlineTs < nowTs

  // canClaimExpired uses canClaimExpiredMilestone from validateAgreement.ts,
  // which exactly mirrors the deployed contract conditions (PactFlow.sol 313–321):
  //   funder only · agreement Active · isFunded · status Pending · deadline > 0 && past
  const canClaimExpired = canClaimExpiredMilestone(
    role, agreementActive, isFunded, Number(status), deadlineTs, nowTs,
  )

  const actionLabel: string | null = (() => {
    if (!agreementActive) return null
    if (canClaimExpired)                                                     return 'Claim expired milestone'
    if (role === 'builder'    && Number(status) === MS.Pending && isFunded) return 'Submit evidence'
    if (role === 'funder'     && Number(status) === MS.Submitted)           return 'Review and approve'
    if (role === 'funder'     && Number(status) === MS.Approved && !fundsReleased) return 'Release payment'
    if (role === 'arbitrator' && Number(status) === MS.Disputed)            return 'Resolve dispute'
    return null
  })()

  // Lock all buttons while any tx for this row is pending/confirming/syncing,
  // or while the parent has an agreement-level tx in-flight.
  const localBusy =
    submitEv.isPending || submitEv.isConfirming ||
    approveMi.isPending || approveMi.isConfirming ||
    releaseMi.isPending || releaseMi.isConfirming ||
    raiseDisp.isPending || raiseDisp.isConfirming ||
    resolveDisp.isPending || resolveDisp.isConfirming ||
    claimExp.isPending || claimExp.isConfirming ||
    syncState === 'syncing'
  const busy = localBusy || parentBusy

  return (
    <div className="milestone-row flex gap-4">
      <TimelineDot status={status} isLast={isLast} index={milestoneIndex} />

      <div className="min-w-0 flex-1 pb-4">
        <button
          onClick={() => setExpanded(e => !e)}
          className="agreement-card flex w-full items-start justify-between gap-3 px-4 py-4 text-left sm:px-5"
          style={{ borderColor: expanded ? 'var(--border-strong)' : 'var(--border)' }}
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-semibold" style={{ color: 'var(--ink)' }}>
                {description || `Milestone ${(milestoneIndex + 1n).toString()}`}
              </span>
              {milestoneStatusBadge(status)}
              {syncState === 'syncing' && (
                <Loader2 className="size-3 animate-spin" style={{ color: 'var(--accent)' }} />
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: 'var(--muted)' }}>
              <span className="tabular-nums font-medium" style={{ color: 'var(--ink-2)' }}>{formatUSDC(amount)} USDC</span>
              {deadlineTs > 0 && (
                <span style={isPast && Number(status) === MS.Pending ? { color: 'var(--warning)' } : undefined}>
                  <Clock className="mr-0.5 inline size-3" />
                  {formatTimestamp(deadlineTs)}
                  {isPast && Number(status) === MS.Pending ? ' (overdue)' : ''}
                </span>
              )}
              {actionLabel && (
                <span className="font-medium" style={{ color: 'var(--accent)' }}>{actionLabel}</span>
              )}
            </div>
          </div>
          {expanded
            ? <ChevronUp  className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--subtle)' }} />
            : <ChevronDown className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--subtle)' }} />}
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="space-y-4 rounded-b-2xl border border-t-0 px-4 pb-4 pt-4 sm:px-5 sm:pb-5"
                style={{ background: 'var(--paper-warm)', borderColor: 'var(--border)' }}>

                {/* Syncing banner for this milestone */}
                <SyncingBanner state={syncState} onRetry={() => { void handleRetry() }} />

                <MilestoneRail status={Number(status)} />

                {/* Evidence display */}
                {evidenceUrlOnchain && (
                  <div className="rounded-lg border p-3" style={{ background: 'var(--accent-glow)', borderColor: 'rgba(93,74,184,0.2)' }}>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--subtle)' }}>
                      Evidence on-chain
                    </p>
                    <a
                      href={evidenceUrlOnchain.startsWith('http') ? evidenceUrlOnchain : `https://${evidenceUrlOnchain}`}
                      target="_blank" rel="noreferrer"
                      className="flex items-center gap-1.5 break-all text-xs hover:underline"
                      style={{ color: 'var(--accent)' }}
                    >
                      <Link2 className="size-3 shrink-0" />
                      {evidenceUrlOnchain}
                      <ExternalLink className="size-3 shrink-0 opacity-60" />
                    </a>
                    <p className="mt-2 rounded-md border px-2.5 py-1.5 text-xs"
                      style={{ background: 'var(--warning-bg)', borderColor: 'var(--warning-border)', color: 'var(--muted)' }}>
                      Evidence is an on-chain record only — it does not automatically prove quality. Only the funder can approve.
                    </p>
                  </div>
                )}

                {/* Builder: submit evidence */}
                {role === 'builder' && Number(status) === MS.Pending && isFunded && agreementActive && (
                  <div className="space-y-2.5">
                    <label className="block text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>
                      Submit Evidence URL
                    </label>
                    <input
                      value={evidenceUrl}
                      onChange={e => setEvidenceUrl(e.target.value)}
                      placeholder="https://… (link to your deliverable)"
                      className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm transition-colors placeholder:text-[var(--subtle)]"
                      style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
                      disabled={busy}
                    />
                    <TxButton
                      label="Submit Evidence"
                      onClick={() => {
                        if (!evidenceUrl.trim()) { toast.error('Enter an evidence URL'); return }
                        // Capture postcondition BEFORE writeContract so the check
                        // closes over the URL that is actually being submitted, not
                        // any future state change.
                        pendingCheckRef.current = checkSubmit(evidenceUrl.trim())
                        submitEv.submit(agreementId, milestoneIndex, evidenceUrl.trim())
                      }}
                      isPending={submitEv.isPending} isConfirming={submitEv.isConfirming}
                      disabled={busy}
                      className="w-full"
                    />
                    <TxReceipt hash={submitEv.hash} isSuccess={submitEv.isSuccess} error={submitEv.error} successLabel="Evidence recorded on-chain" />
                  </div>
                )}

                {/* Funder: approve or dispute (Submitted) */}
                {role === 'funder' && Number(status) === MS.Submitted && agreementActive && (
                  <div className="space-y-2.5">
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>
                      Review the evidence above. Approval does not release funds automatically — a separate Release step is required.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <TxButton label="Approve" onClick={() => { pendingCheckRef.current = checkApprove(); approveMi.approve(agreementId, milestoneIndex) }} isPending={approveMi.isPending} isConfirming={approveMi.isConfirming} disabled={busy} />
                      <TxButton label="Dispute" variant="danger" onClick={() => { pendingCheckRef.current = checkDispute(); raiseDisp.raise(agreementId, milestoneIndex) }} isPending={raiseDisp.isPending} isConfirming={raiseDisp.isConfirming} disabled={busy} />
                    </div>
                    <TxReceipt hash={approveMi.hash} isSuccess={approveMi.isSuccess} error={approveMi.error} successLabel="Milestone approved" />
                    <TxReceipt hash={raiseDisp.hash} isSuccess={raiseDisp.isSuccess} error={raiseDisp.error} successLabel="Dispute raised" />
                  </div>
                )}

                {/* Funder: release (Approved) */}
                {role === 'funder' && Number(status) === MS.Approved && !fundsReleased && agreementActive && (
                  <div className="space-y-2.5">
                    <div className="flex items-start gap-2 rounded-lg border p-3"
                      style={{ background: 'var(--success-bg)', borderColor: 'var(--success-border)' }}>
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--success)' }} />
                      <p className="text-xs" style={{ color: 'var(--ink-2)' }}>
                        Approved. Releasing {formatUSDC(amount)} USDC will credit the builder's claimable balance.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <TxButton label={`Release ${formatUSDC(amount)} USDC`} onClick={() => { pendingCheckRef.current = checkRelease(); releaseMi.release(agreementId, milestoneIndex) }} isPending={releaseMi.isPending} isConfirming={releaseMi.isConfirming} disabled={busy} />
                      <TxButton label="Dispute" variant="danger" onClick={() => { pendingCheckRef.current = checkDispute(); raiseDisp.raise(agreementId, milestoneIndex) }} isPending={raiseDisp.isPending} isConfirming={raiseDisp.isConfirming} disabled={busy} />
                    </div>
                    <TxReceipt hash={releaseMi.hash} isSuccess={releaseMi.isSuccess} error={releaseMi.error} successLabel={`${formatUSDC(amount)} USDC credited to builder`} />
                  </div>
                )}

                {/* Builder: dispute approved */}
                {role === 'builder' && Number(status) === MS.Approved && agreementActive && (
                  <div className="space-y-2">
                    <TxButton label="Raise Dispute" variant="danger" onClick={() => { pendingCheckRef.current = checkDispute(); raiseDisp.raise(agreementId, milestoneIndex) }} isPending={raiseDisp.isPending} isConfirming={raiseDisp.isConfirming} disabled={busy} className="w-full" />
                    <TxReceipt hash={raiseDisp.hash} isSuccess={raiseDisp.isSuccess} error={raiseDisp.error} successLabel="Dispute raised" />
                  </div>
                )}

                {/* Arbitrator: resolve dispute */}
                {role === 'arbitrator' && Number(status) === MS.Disputed && agreementActive && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 rounded-lg border px-3 py-2.5"
                      style={{ background: 'var(--warning-bg)', borderColor: 'var(--warning-border)' }}>
                      <Shield className="size-4 shrink-0" style={{ color: 'var(--warning)' }} />
                      <p className="text-xs" style={{ color: 'var(--ink-2)' }}>
                        You are the arbitrator. Your resolution is final — review both sides carefully.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <TxButton label="Award to Builder" onClick={() => { pendingCheckRef.current = checkRelease(); resolveDisp.resolve(agreementId, milestoneIndex, false) }} isPending={resolveDisp.isPending} isConfirming={resolveDisp.isConfirming} disabled={busy} />
                      <TxButton label="Refund to Funder" variant="ghost" onClick={() => { pendingCheckRef.current = checkRefund(); resolveDisp.resolve(agreementId, milestoneIndex, true) }} isPending={resolveDisp.isPending} isConfirming={resolveDisp.isConfirming} disabled={busy} />
                    </div>
                    <TxReceipt hash={resolveDisp.hash} isSuccess={resolveDisp.isSuccess} error={resolveDisp.error} successLabel="Dispute resolved" />
                  </div>
                )}

                {/* Funder: claim expired milestone (Pending + deadline past + funded + active) */}
                {/* Contract: claimExpiredMilestone — funder, Active, isFunded, Pending, deadline > 0 && past */}
                {canClaimExpired && (
                  <div className="space-y-2.5">
                    <div className="flex items-start gap-2 rounded-lg border px-3 py-2.5"
                      style={{ background: 'var(--warning-bg)', borderColor: 'var(--warning-border)' }}>
                      <Clock className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--warning)' }} />
                      <div className="text-xs" style={{ color: 'var(--ink-2)' }}>
                        <p className="font-semibold">Milestone deadline has passed</p>
                        <p className="mt-0.5" style={{ color: 'var(--muted)' }}>
                          The builder did not submit evidence before the deadline.
                          As funder you may reclaim {formatUSDC(amount)} USDC to your claimable balance.
                        </p>
                      </div>
                    </div>
                    <TxButton
                      label={`Reclaim ${formatUSDC(amount)} USDC`}
                      onClick={() => { pendingCheckRef.current = checkRefund(); claimExp.claimExpired(agreementId, milestoneIndex) }}
                      isPending={claimExp.isPending}
                      isConfirming={claimExp.isConfirming}
                      disabled={busy}
                      className="w-full"
                    />
                    <TxReceipt
                      hash={claimExp.hash}
                      isSuccess={claimExp.isSuccess}
                      error={claimExp.error}
                      successLabel={`${formatUSDC(amount)} USDC credited to your claimable balance`}
                    />
                  </div>
                )}

                {/* Terminal states */}
                {Number(status) === MS.Released && (
                  <div className="flex items-center gap-2 rounded-lg border px-3 py-2.5"
                    style={{ background: 'var(--success-bg)', borderColor: 'var(--success-border)' }}>
                    <CheckCircle2 className="size-4 shrink-0" style={{ color: 'var(--success)' }} />
                    <span className="text-sm font-medium" style={{ color: 'var(--ink-2)' }}>
                      {formatUSDC(amount)} USDC released to builder's claimable balance
                    </span>
                  </div>
                )}
                {Number(status) === MS.Refunded && (
                  <div className="flex items-center gap-2 rounded-lg border px-3 py-2.5"
                    style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}>
                    <CheckCircle2 className="size-4 shrink-0" style={{ color: 'var(--subtle)' }} />
                    <span className="text-sm" style={{ color: 'var(--muted)' }}>
                      {cancelledUnfunded
                        ? 'Cancelled — no funds were held in escrow'
                        : "Refunded to funder's claimable balance"}
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ── Address link with copy ────────────────────────────────────────────────────
function AddrLink({ label, addr }: { label: string; addr: string }) {
  const [copied, setCopied] = useState(false)
  function handleCopy(e: React.MouseEvent) {
    e.preventDefault()
    void navigator.clipboard.writeText(addr).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }
  return (
    <span className="flex items-center gap-1">
      <span className="text-[11px]" style={{ color: 'var(--subtle)' }}>{label}</span>
      <a
        href={buildAddressUrl(addr)}
        target="_blank" rel="noreferrer"
        className="mono inline-flex items-center gap-0.5 text-xs hover:underline"
        style={{ color: 'var(--muted)' }}
        title={addr}
      >
        {shortenAddress(addr)}
        <ExternalLink className="size-2.5 opacity-40" />
      </a>
      <button
        onClick={handleCopy}
        title="Copy address"
        className="rounded p-0.5 opacity-40 transition-opacity hover:opacity-100"
        style={{ color: 'var(--subtle)' }}
      >
        {copied
          ? <Check  className="size-2.5" style={{ color: 'var(--success)' }} />
          : <Copy   className="size-2.5" />}
      </button>
    </span>
  )
}

// ── Agreement detail ──────────────────────────────────────────────────────────
interface AgreementDetailProps {
  agreementId: bigint
  onBack: () => void
}

export function AgreementDetail({ agreementId, onBack }: AgreementDetailProps) {
  const { address, chainId } = useAccount()

  const {
    data: rawAgreement, isLoading, isError,
    refetch: _refetchAgreement,
  } = useAgreement(agreementId)
  const { refetch: _refetchMilestoneCount } = useMilestoneCount(agreementId)
  const { data: escrowBalanceRaw,   refetch: _refetchEscrow    } = useAgreementBalance(agreementId)
  const { data: pendingWithdrawRaw, refetch: _refetchPending   } = usePendingWithdrawals(address)
  const { data: usdcAllowanceRaw,   refetch: _refetchAllowance } = useUSDCAllowance(address)
  const { data: usdcBalanceRaw,     refetch: _refetchUsdcBal   } = useUSDCBalance(address)

  const ag   = rawAgreement as AgreementData | undefined
  const role = useWalletRole(ag?.funder, ag?.builder, ag?.arbitrator)

  const fund         = useFundAgreement()
  const approveUSDC  = useApproveUSDC()
  const cancel       = useCancelAgreement()
  const withdrawHook = useWithdraw()

  // ── Sync state ─────────────────────────────────────────────────────────────
  const [syncState, setSyncState] = useState<SyncState>('idle')

  // ── Results ref — written synchronously inside each typed refetch wrapper.
  //
  // Postconditions MUST read from here, not from React state or liveRef.
  // Rationale: retryRefetch calls check() inside Promise.allSettled(...).then()
  // — a microtask that runs BEFORE the next React render cycle. React state and
  // useEffect-based refs are only updated after the commit phase (after paint),
  // so they still hold pre-refetch values when check() fires. The results ref
  // is written in the .then() of each individual refetch promise, which runs
  // BEFORE the allSettled .then(), so it is always up-to-date when check() runs.
  //
  // All fields default to undefined; a failed refetch leaves the field undefined.
  // Postconditions MUST guard against undefined to avoid zero-default false positives.
  const resultsRef = useRef<{
    isFunded:       boolean | undefined
    agStatus:       number  | undefined
    escrowBalance:  bigint  | undefined
    pendingWithdraw: bigint | undefined
    usdcAllowance:  bigint  | undefined
    escrowCost:     bigint  | undefined   // from agreement.totalAmount
  }>({
    isFunded:       undefined,
    agStatus:       undefined,
    escrowBalance:  undefined,
    pendingWithdraw: undefined,
    usdcAllowance:  undefined,
    escrowCost:     undefined,
  })

  // Typed refetch wrappers — each writes its result to resultsRef on success,
  // leaves it undefined on failure. These are passed as the RefetchFn array.
  type WagmiRefetchResult<T> = { data?: T; error?: unknown }
  // Each typed wrapper:
  //   1. Calls the underlying wagmi refetch.
  //   2. On rejection (.catch): clears the result field — a rejected promise is a failed read.
  //   3. On resolution (.then): ALSO checks r.error !== null/undefined. A wagmi refetch can
  //      resolve with { data: undefined, error: Error } when the RPC call fails but the
  //      Promise itself fulfills. That is a failed read — clear the field.
  const refetchAgreement = useCallback((): Promise<unknown> =>
    (_refetchAgreement as () => Promise<WagmiRefetchResult<unknown>>)().then(r => {
      if (r.error != null) {
        resultsRef.current.isFunded = undefined
        resultsRef.current.agStatus = undefined
        resultsRef.current.escrowCost = undefined
        return
      }
      const d = r.data as AgreementData | undefined
      resultsRef.current.isFunded   = d ? Boolean(d.isFunded) : undefined
      resultsRef.current.agStatus   = d ? Number(d.status)    : undefined
      resultsRef.current.escrowCost = d?.totalAmount
    }).catch(() => {
      resultsRef.current.isFunded   = undefined
      resultsRef.current.agStatus   = undefined
      resultsRef.current.escrowCost = undefined
    }),
  [_refetchAgreement])

  const refetchEscrow = useCallback((): Promise<unknown> =>
    (_refetchEscrow as () => Promise<WagmiRefetchResult<unknown>>)().then(r => {
      resultsRef.current.escrowBalance = (r.error == null && typeof r.data === 'bigint') ? r.data : undefined
    }).catch(() => { resultsRef.current.escrowBalance = undefined }),
  [_refetchEscrow])

  const refetchPending = useCallback((): Promise<unknown> =>
    (_refetchPending as () => Promise<WagmiRefetchResult<unknown>>)().then(r => {
      resultsRef.current.pendingWithdraw = (r.error == null && typeof r.data === 'bigint') ? r.data : undefined
    }).catch(() => { resultsRef.current.pendingWithdraw = undefined }),
  [_refetchPending])

  const refetchAllowance = useCallback((): Promise<unknown> =>
    (_refetchAllowance as () => Promise<WagmiRefetchResult<unknown>>)().then(r => {
      resultsRef.current.usdcAllowance = (r.error == null && typeof r.data === 'bigint') ? r.data : undefined
    }).catch(() => { resultsRef.current.usdcAllowance = undefined }),
  [_refetchAllowance])

  // Fire-and-forget refetches (no postcondition reads their results)
  const refetchMilestoneCount = _refetchMilestoneCount as RefetchFn
  const refetchUsdcBal        = _refetchUsdcBal        as RefetchFn

  const allRefetches = useMemo(
    () => [refetchAgreement, refetchEscrow, refetchPending, refetchAllowance, refetchMilestoneCount, refetchUsdcBal],
    [refetchAgreement, refetchEscrow, refetchPending, refetchAllowance, refetchMilestoneCount, refetchUsdcBal],
  )

  const { syncAll }        = useRefetchGroup(allRefetches, { maxAttempts: 4, intervalMs: 1500 })

  // ── Fire-and-refresh (background, no tx verification) ─────────────────────
  // Used by MilestoneRow's onTxConfirmed: re-reads agreement data once after a
  // milestone tx confirms. Never touches syncState (which belongs to tx verification).
  //
  // Separate refreshState tracks success/failure of this background pass:
  //   'idle'          — no refresh in progress / last one succeeded.
  //   'refreshing'    — reads in flight.
  //   'refresh-error' — one or more required reads failed; show "Could not refresh"
  //                     with a Retry button that re-runs the refresh (no postcondition).
  //
  // A failed read is detected by checking BOTH promise rejection AND r.error in the
  // wagmi refetch result. A result with r.error !== null is a failed network read
  // even if the promise itself resolved (wagmi can return { data: undefined, error: … }).
  const [refreshState, setRefreshState] = useState<'idle' | 'refreshing' | 'refresh-error'>('idle')
  // Per-read success flags written by the refresh wrappers.
  type RefreshResults = { agreement: boolean; escrow: boolean; pending: boolean }
  const refreshResultsRef = useRef<RefreshResults>({ agreement: false, escrow: false, pending: false })
  // AbortController for the refresh pass — cancelled on identity change.
  const refreshCtrlRef = useRef<AbortController | null>(null)

  // Wrappers that set a per-read flag for the refresh pass.
  // These run the SAME underlying refetch as the tx-verification wrappers
  // (same wagmi query cache), but track success/failure for the refresh pass.
  type WRR = { data?: unknown; error?: unknown }
  const refreshRefetchAgreement = useCallback((): Promise<unknown> =>
    (_refetchAgreement as () => Promise<WRR>)()
      .then(r => { refreshResultsRef.current.agreement = r.error == null })
      .catch(() => { refreshResultsRef.current.agreement = false }),
  [_refetchAgreement])

  const refreshRefetchEscrow = useCallback((): Promise<unknown> =>
    (_refetchEscrow as () => Promise<WRR>)()
      .then(r => { refreshResultsRef.current.escrow = r.error == null })
      .catch(() => { refreshResultsRef.current.escrow = false }),
  [_refetchEscrow])

  const refreshRefetchPending = useCallback((): Promise<unknown> =>
    (_refetchPending as () => Promise<WRR>)()
      .then(r => { refreshResultsRef.current.pending = r.error == null })
      .catch(() => { refreshResultsRef.current.pending = false }),
  [_refetchPending])

  const refreshRefetches = useMemo(
    () => [refreshRefetchAgreement, refreshRefetchEscrow, refreshRefetchPending,
           refetchAllowance, refetchMilestoneCount, refetchUsdcBal],
    [refreshRefetchAgreement, refreshRefetchEscrow, refreshRefetchPending,
     refetchAllowance, refetchMilestoneCount, refetchUsdcBal],
  )
  const { syncAll: syncOnce } = useRefetchGroup(refreshRefetches, { maxAttempts: 1, intervalMs: 0 })

  const refreshOnce = useCallback((): Promise<void> => {
    // Cancel any prior refresh pass.
    refreshCtrlRef.current?.abort()
    const ctrl = new AbortController()
    refreshCtrlRef.current = ctrl

    // Reset per-read flags before the attempt.
    refreshResultsRef.current = { agreement: false, escrow: false, pending: false }

    // Only show 'refreshing' if the sync banner is not already active.
    // We must not stomp syncState with a background refresh indicator.
    setRefreshState('refreshing')

    return syncOnce(undefined).then(() => {
      if (ctrl.signal.aborted) return   // identity changed — discard result
      const r = refreshResultsRef.current
      // All required reads must have succeeded.
      if (r.agreement && r.escrow && r.pending) {
        setRefreshState('idle')
      } else {
        setRefreshState('refresh-error')
      }
    })
  }, [syncOnce])

  // Retry the refresh: same as refreshOnce (no postcondition — just re-read).
  const handleRefreshRetry = useCallback(() => { void refreshOnce() }, [refreshOnce])

  // ── currentCheckRef — stores the postcondition from the last tx so Retry
  //    can reuse it. Never cleared between retries.
  const currentCheckRef = useRef<(() => boolean) | undefined>(undefined)

  // Public: call after any confirmed agreement-level tx.
  // check: postcondition for this specific tx. Stored in currentCheckRef so
  //        the Retry button can reuse the same check without needing the tx context.
  // CRITICAL: only update state when result !== 'cancelled', to avoid stomping
  // a newer sync that has already called setSyncState('syncing').
  const syncAllWithStatus = useCallback(async (check?: () => boolean): Promise<void> => {
    if (check !== undefined) currentCheckRef.current = check
    setSyncState('syncing')
    const result = await syncAll(currentCheckRef.current)
    if (result !== 'cancelled') {
      setSyncState(result === 'fresh' ? 'idle' : 'exhausted')
    }
  }, [syncAll])

  // Retry: reuses the postcondition from the last confirmed tx.
  // If no postcondition was ever stored, fires without one (exhausts immediately
  // after maxAttempts — callers will still see fresh reads even if result='exhausted').
  const handleRetry = useCallback(async () => {
    setSyncState('syncing')
    const result = await syncAll(currentCheckRef.current)
    if (result !== 'cancelled') {
      setSyncState(result === 'fresh' ? 'idle' : 'exhausted')
    }
  }, [syncAll])

  // ── Fire sync on confirmed tx (leading-edge detection) ────────────────────
  // Postconditions read from resultsRef — guaranteed to reflect the refetch
  // that just completed, not stale React state.
  const prevFlags = useRef({ fund: false, cancel: false, withdraw: false, approve: false })

  useEffect(() => {
    if (fund.isSuccess && !prevFlags.current.fund) {
      prevFlags.current.fund = true
      // Deposit: isFunded must be true AND escrow balance must be > 0.
      // Both fields must be defined (read succeeded); undefined fails the check.
      void syncAllWithStatus(() => {
        const r = resultsRef.current
        return r.isFunded === true &&
               r.escrowBalance !== undefined && r.escrowBalance > 0n
      })
    }
    if (!fund.isSuccess) prevFlags.current.fund = false
  }, [fund.isSuccess, syncAllWithStatus])

  useEffect(() => {
    if (cancel.isSuccess && !prevFlags.current.cancel) {
      prevFlags.current.cancel = true
      // Cancellation: agStatus must be Cancelled, escrow must be 0,
      // and if isFunded was previously true the refund credit (pendingWithdraw > 0)
      // OR the escrow draining to 0 confirms the refund path.
      // We require at minimum: Cancelled status confirmed and escrow = 0.
      // If isFunded was true we also require pendingWithdraw to be defined
      // (read succeeded) — but we don't demand pendingWithdraw > 0 because the
      // funder may have already claimed from a prior tx. The key safety is
      // "escrow is definitely zero" so we know funds aren't stuck.
      const wasFunded = resultsRef.current.isFunded === true
      void syncAllWithStatus(() => {
        const r = resultsRef.current
        const statusOk   = r.agStatus  !== undefined && r.agStatus  === Number(AgreementStatus.Cancelled)
        const escrowOk   = r.escrowBalance !== undefined && r.escrowBalance === 0n
        // If the agreement was funded we also require that pendingWithdraw was
        // successfully read (not undefined) to confirm no stuck funds.
        const withdrawOk = !wasFunded || r.pendingWithdraw !== undefined
        return statusOk && escrowOk && withdrawOk
      })
    }
    if (!cancel.isSuccess) prevFlags.current.cancel = false
  }, [cancel.isSuccess, syncAllWithStatus])

  useEffect(() => {
    if (withdrawHook.isSuccess && !prevFlags.current.withdraw) {
      prevFlags.current.withdraw = true
      // Claim: pendingWithdraw must be defined (read succeeded) AND === 0n.
      // undefined defaults to 0 is a false positive — explicitly guard.
      void syncAllWithStatus(() => {
        const r = resultsRef.current
        return r.pendingWithdraw !== undefined && r.pendingWithdraw === 0n
      })
    }
    if (!withdrawHook.isSuccess) prevFlags.current.withdraw = false
  }, [withdrawHook.isSuccess, syncAllWithStatus])

  useEffect(() => {
    if (approveUSDC.isSuccess && !prevFlags.current.approve) {
      prevFlags.current.approve = true
      // Approval: allowance must be defined and >= escrowCost (which must also be defined).
      void syncAllWithStatus(() => {
        const r = resultsRef.current
        return r.usdcAllowance !== undefined &&
               r.escrowCost   !== undefined &&
               r.usdcAllowance >= r.escrowCost
      })
    }
    if (!approveUSDC.isSuccess) prevFlags.current.approve = false
  }, [approveUSDC.isSuccess, syncAllWithStatus])

  // ── Reset tx state + sync on agreement/wallet/chain change ───────────────
  // chainId is included so a chain switch (e.g. wrong network) clears stale tx
  // state and re-evaluates reads against the new chain context.
  useEffect(() => {
    fund.reset()
    approveUSDC.reset()
    cancel.reset()
    withdrawHook.reset()
    currentCheckRef.current = undefined
    setSyncState('idle')
    // Also abort any in-flight background refresh and clear its error state.
    refreshCtrlRef.current?.abort()
    refreshCtrlRef.current = null
    setRefreshState('idle')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agreementId, address, chainId])

  // ── Derived values ─────────────────────────────────────────────────────────
  const escrowBalance   = typeof escrowBalanceRaw  === 'bigint' ? escrowBalanceRaw  : undefined
  const pendingWithdraw = typeof pendingWithdrawRaw === 'bigint' ? pendingWithdrawRaw : undefined
  const usdcAllowance   = typeof usdcAllowanceRaw  === 'bigint' ? usdcAllowanceRaw  : 0n
  const usdcBalance     = typeof usdcBalanceRaw    === 'bigint' ? usdcBalanceRaw    : undefined

  // True while any agreement-level tx or sync is in-flight
  const agreementBusy =
    fund.isPending || fund.isConfirming ||
    approveUSDC.isPending || approveUSDC.isConfirming ||
    cancel.isPending || cancel.isConfirming ||
    withdrawHook.isPending || withdrawHook.isConfirming ||
    syncState === 'syncing'

  // ── Loading / Error ────────────────────────────────────────────────────────
  if (isLoading) return (
    <div className="page-shell">
      <div className="skeleton mb-5 h-5 w-28 rounded" />
      <div className="skeleton mb-6 h-56 rounded-2xl" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="skeleton h-28 rounded-2xl" />
        <div className="skeleton h-28 rounded-2xl" />
      </div>
    </div>
  )

  if (isError || !rawAgreement || !ag || typeof ag.funder !== 'string') return (
    <div className="page-shell">
      <button onClick={onBack} className="mb-6 flex items-center gap-1.5 text-sm transition-colors hover:text-[var(--ink)]" style={{ color: 'var(--muted)' }}>
        <ArrowLeft className="size-4" /> Dashboard
      </button>
      <div className="panel mx-auto max-w-xl p-10 text-center">
        <AlertTriangle className="mx-auto mb-3 size-8" style={{ color: 'var(--warning)' }} />
        <p className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>
          {isError ? 'Failed to load agreement' : `Agreement #${agreementId.toString()} not found`}
        </p>
        <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>Check the network or try again.</p>
        <button
          onClick={() => { void refetchAgreement() }}
          className="mx-auto mt-4 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-white/5"
          style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}
        >
          <RefreshCw className="size-3.5" /> Retry
        </button>
      </div>
    </div>
  )

  const { funder, builder, arbitrator, status, milestones, totalAmount, isFunded } = ag
  const agStatus        = Number(status) as AgreementStatus
  const isCancelled     = Number(agStatus) === Number(AgreementStatus.Cancelled)
  const isActive        = Number(agStatus) === Number(AgreementStatus.Active)
  const cancelledUnfunded = isCancelled && !isFunded

  const msArray    = Array.isArray(milestones) ? milestones : []
  const count      = msArray.length
  const escrowCost = totalAmount ?? 0n
  const needsApproval = !isFunded && usdcAllowance < escrowCost

  const releasedCount  = msArray.filter(m => Number(m.status) === MS.Released).length
  const refundedCount  = msArray.filter(m => Number(m.status) === MS.Refunded).length
  const resolvedCount  = releasedCount + refundedCount   // both are terminal states
  const disputedCount  = msArray.filter(m => Number(m.status) === MS.Disputed).length
  const submittedCount = msArray.filter(m => Number(m.status) === MS.Submitted).length
  const approvedCount  = msArray.filter(m => Number(m.status) === MS.Approved).length
  // Progress tracks all resolved milestones (released OR refunded), not only payments.
  const progressPct    = count > 0 ? Math.round((resolvedCount / count) * 100) : 0

  // Show claimable only when we have a confirmed positive value.
  // While syncing after a claim, keep the old value visible so the
  // "Updating balances…" banner appears in context — the block disappears
  // naturally once the refetch returns pendingWithdraw = 0.
  const showClaimable = address && pendingWithdraw !== undefined && pendingWithdraw > 0n

  return (
    <div className="page-shell">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.26 }}>

        <button
          onClick={onBack}
          className="mb-7 flex items-center gap-2 text-sm hover:text-[var(--ink)]"
          style={{ color: 'var(--muted)' }}
        >
          <ArrowLeft className="size-4" /> Dashboard
        </button>

        {/* Agreement-level sync banner (tx verification) */}
        <SyncingBanner state={syncState} onRetry={() => { void handleRetry() }} />
        {/* Background-refresh error banner — only shown when no tx verification is active */}
        <RefreshErrorBanner
          show={refreshState === 'refresh-error' && syncState === 'idle'}
          onRetry={handleRefreshRetry}
        />

        {/* ── Header card ─────────────────────────────────────────── */}
        <div className="panel mb-6 p-5 sm:p-7">
          <div className="relative z-10 flex flex-col items-start justify-between gap-6 lg:flex-row">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="display text-2xl font-semibold sm:text-3xl" style={{ color: 'var(--ink)' }}>
                  Agreement #{agreementId.toString()}
                </h1>
                {agreementStatusBadge(agStatus)}
                {disputedCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                    style={{ background: 'var(--warning-bg)', borderColor: 'var(--warning-border)', color: 'var(--warning)' }}>
                    <AlertTriangle className="size-2.5" /> {disputedCount} disputed
                  </span>
                )}
              </div>

              <div className="mt-4 grid gap-x-5 gap-y-2 text-xs sm:grid-cols-2">
                {funder     && <AddrLink label="Funder"     addr={funder} />}
                {builder    && <AddrLink label="Builder"    addr={builder} />}
                {arbitrator && <AddrLink label="Arbitrator" addr={arbitrator} />}
                <AddrLink label="Contract" addr={PACTFLOW_ADDRESS} />
              </div>

              {role && role !== 'observer' && <div className="mt-3"><RolePill role={role} /></div>}
            </div>

            {/* Three-figure summary: value / escrow now / claimable */}
            <div className="flex w-full items-center justify-between gap-4 border-t pt-5 text-right lg:w-auto lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0" style={{ borderColor: 'var(--border)' }}>
              <ResolutionDial progress={progressPct} />
              <div className="min-w-[140px]">
                <div className="display text-2xl font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
                  {formatUSDC(escrowCost)}
                  <span className="ml-1 text-sm font-normal" style={{ color: 'var(--subtle)' }}>USDC</span>
                </div>
                <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>
                  Agreement value
                </div>
              </div>

              {/* In Escrow now — only meaningful when funded and active */}
              {isFunded && isActive && (
                <div className="mt-3 rounded-xl border px-3 py-2 text-right"
                  style={{ background: 'var(--accent-glow)', borderColor: 'rgba(93,74,184,0.18)' }}>
                  <div className="text-xs font-semibold tabular-nums" style={{ color: 'var(--ink-2)' }}>
                    {escrowBalance !== undefined
                      ? `${formatUSDC(escrowBalance)} USDC`
                      : syncState === 'syncing' ? 'Updating…' : '—'}
                  </div>
                  <div className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>
                    In escrow now
                  </div>
                </div>
              )}

              {/* Awaiting funding — active but not yet deposited */}
              {!isFunded && isActive && (
                <div className="mt-2.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--warning)' }}>
                    Awaiting funding
                  </span>
                </div>
              )}

              {/* Your claimable — only when connected and positive */}
              {pendingWithdraw !== undefined && pendingWithdraw > 0n && address && (
                <div className="mt-2.5 rounded-lg border px-2.5 py-1.5 text-right"
                  style={{ background: 'var(--success-bg)', borderColor: 'var(--success-border)' }}>
                  <div className="text-xs font-semibold tabular-nums" style={{ color: 'var(--success)' }}>
                    {formatUSDC(pendingWithdraw)} USDC
                  </div>
                  <div className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>
                    Your claimable
                  </div>
                </div>
              )}
            </div>
          </div>

          {count > 0 && (
            <div className="relative z-10 mt-6 border-t pt-5" style={{ borderColor: 'var(--border)' }}>
              {/* Resolution progress bar.
                  Active funded agreements: show the bar only when funded.
                  Terminal agreements (Completed / Cancelled): always show
                  resolved = released + refunded so a fully-refunded agreement
                  reads as 100% resolved, not 0% released. */}
              {(isFunded || !isActive) && (
                <>
                  <div className="mb-1.5 flex items-center justify-between text-xs" style={{ color: 'var(--subtle)' }}>
                    <span>Milestone progress</span>
                    <span className="tabular-nums">
                      {resolvedCount} of {count} resolved
                      {progressPct > 0 ? ` · ${progressPct}%` : ''}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--border)' }}>
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        background: progressPct === 100
                          ? (refundedCount > 0 && releasedCount === 0
                              ? 'var(--subtle)'       // all refunded — neutral grey
                              : releasedCount === resolvedCount
                                ? 'var(--success)'   // all released — green
                                : 'var(--accent)')   // mixed — blue
                          : 'var(--accent)',
                      }}
                      initial={{ width: 0 }}
                      animate={{ width: `${progressPct}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                    />
                  </div>
                  {/* Secondary breakdown line for terminal agreements with any refunded */}
                  {!isActive && refundedCount > 0 && (
                    <div className="mt-1 text-[10px] tabular-nums" style={{ color: 'var(--subtle)' }}>
                      {releasedCount} released · {refundedCount} refunded
                    </div>
                  )}
                </>
              )}
              {/* Status legend — active agreements only */}
              {isActive && (
                <div className="mt-1.5 flex flex-wrap gap-3 text-[11px]" style={{ color: 'var(--subtle)' }}>
                  {submittedCount > 0 && <span style={{ color: 'var(--violet)' }}>{submittedCount} submitted</span>}
                  {approvedCount  > 0 && <span style={{ color: 'var(--accent)' }}>{approvedCount} approved</span>}
                  {disputedCount  > 0 && <span style={{ color: 'var(--warning)' }}>{disputedCount} disputed</span>}
                  {releasedCount  > 0 && <span style={{ color: 'var(--success)' }}>{releasedCount} released</span>}
                  {refundedCount  > 0 && <span style={{ color: 'var(--subtle)' }}>{refundedCount} refunded</span>}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Terminal resolution summary ─────────────────────────── */}
        {/* Shown when the agreement is no longer active. Factual; never
            implies funds moved when they did not. Released milestones are
            shown separately from refunded ones so a fully-refunded agreement
            does not look like unfinished work. */}
        {!isActive && (
          <div className="mb-4 rounded-2xl border p-4"
            style={{
              background: isCancelled ? 'var(--surface)' : 'var(--success-bg)',
              borderColor: isCancelled ? 'var(--border)' : 'var(--success-border)',
            }}>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl"
                style={{
                  background: isCancelled ? 'var(--surface-muted)' : 'rgba(40,117,84,0.12)',
                }}>
                {isCancelled
                  ? <AlertTriangle className="size-4" style={{ color: 'var(--subtle)' }} />
                  : <CheckCircle2  className="size-4" style={{ color: 'var(--success)' }} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>
                  {isCancelled ? 'Agreement cancelled' : 'Agreement completed'}
                </p>

                {/* Completed with payments: show released milestones and USDC total */}
                {!isCancelled && releasedCount > 0 && (
                  <p className="mt-0.5 text-xs text-pretty" style={{ color: 'var(--muted)' }}>
                    {releasedCount} milestone{releasedCount > 1 ? 's' : ''} released —{' '}
                    <span className="tabular-nums font-semibold" style={{ color: 'var(--success)' }}>
                      {formatUSDC(
                        msArray
                          .filter(m => Number(m.status) === MS.Released)
                          .reduce((s, m) => s + (m.amount ?? 0n), 0n)
                      )} USDC
                    </span>
                    {' '}credited to builder's claimable balance.
                    {refundedCount > 0 && (
                      <> {refundedCount} milestone{refundedCount > 1 ? 's' : ''} refunded to funder.</>
                    )}
                  </p>
                )}

                {/* Completed with no payments: all milestones resolved via refund */}
                {!isCancelled && releasedCount === 0 && refundedCount > 0 && (
                  <p className="mt-0.5 text-xs text-pretty" style={{ color: 'var(--muted)' }}>
                    {refundedCount} milestone{refundedCount > 1 ? 's' : ''} resolved —{' '}
                    {refundedCount === 1 ? 'the milestone was' : 'all milestones were'} refunded to
                    the funder's claimable balance. No payments were released to the builder.
                  </p>
                )}

                {/* Cancelled before funding */}
                {isCancelled && cancelledUnfunded && (
                  <p className="mt-0.5 text-xs text-pretty" style={{ color: 'var(--muted)' }}>
                    Cancelled before any USDC was deposited. No funds were at risk.
                  </p>
                )}

                {/* Cancelled after funding — funds were credited to funder's claimable balance.
                    We do not know from struct data alone whether the funder has since claimed;
                    pendingWithdrawals is a live read shown separately above. */}
                {isCancelled && !cancelledUnfunded && (
                  <p className="mt-0.5 text-xs text-pretty" style={{ color: 'var(--muted)' }}>
                    {refundedCount > 0
                      ? `${refundedCount} milestone${refundedCount > 1 ? 's' : ''} refunded — USDC credited to funder's claimable balance.`
                      : 'USDC credited to funder\'s claimable balance.'}
                    {' '}Check the claimable balance above for the current unclaimed amount.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Fund escrow ─────────────────────────────────────────── */}
        {role === 'funder' && !isFunded && isActive && (
          <div className="panel-flat mb-6 p-5 sm:p-6" style={{ background: 'var(--accent-glow)', borderColor: 'rgba(93,74,184,0.22)' }}>
            <h2 className="mb-1 text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>Fund Escrow</h2>
            <p className="mb-3 text-xs text-pretty" style={{ color: 'var(--muted)' }}>
              Deposit {formatUSDC(escrowCost)} USDC into the escrow contract to activate all milestones.
              {usdcBalance !== undefined && usdcBalance > 0n && (
                <> Your wallet holds{' '}
                  <span className="tabular-nums font-semibold" style={{ color: 'var(--ink-2)' }}>
                    {formatUSDCOrZero(usdcBalance)} USDC
                  </span>.
                </>
              )}
            </p>
            {needsApproval ? (
              <div className="space-y-3">
                <TxButton label={`Approve ${formatUSDC(escrowCost)} USDC`} onClick={() => approveUSDC.approve(escrowCost)} isPending={approveUSDC.isPending} isConfirming={approveUSDC.isConfirming} disabled={agreementBusy} className="w-full" />
                <TxReceipt hash={approveUSDC.hash} isSuccess={approveUSDC.isSuccess} error={approveUSDC.error} successLabel="Approved — you can now fund the escrow" />
              </div>
            ) : (
              <div className="space-y-3">
                <TxButton label={`Deposit ${formatUSDC(escrowCost)} USDC`} onClick={() => fund.fund(agreementId)} isPending={fund.isPending} isConfirming={fund.isConfirming} disabled={agreementBusy} className="w-full" />
                <TxReceipt hash={fund.hash} isSuccess={fund.isSuccess} error={fund.error} successLabel="Escrow funded — milestones active" />
              </div>
            )}
          </div>
        )}

        {/* ── Claimable balance ─────────────────────────────────────── */}
        {showClaimable && (
          <div className="panel-flat mb-6 p-5" style={{ background: 'var(--success-bg)', borderColor: 'var(--success-border)' }}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <div className="flex size-10 items-center justify-center rounded-xl" style={{ background: 'var(--success-bg)' }}>
                  <Wallet2 className="size-[18px]" style={{ color: 'var(--success)' }} />
                </div>
                <div>
                  <p className="text-xs font-semibold" style={{ color: 'var(--success)' }}>
                    {withdrawHook.isSuccess ? 'Claimed — updating…' : 'Claimable'}
                  </p>
                  <p className="display text-lg font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                    {formatUSDC(pendingWithdraw)}
                    <span className="ml-1 text-sm font-normal" style={{ color: 'var(--muted)' }}>USDC</span>
                  </p>
                </div>
              </div>
              {/* Disabled after success until balances refresh (disappears when pendingWithdraw hits 0) */}
              <TxButton
                label="Claim"
                onClick={withdrawHook.withdraw}
                isPending={withdrawHook.isPending}
                isConfirming={withdrawHook.isConfirming}
                disabled={agreementBusy || withdrawHook.isSuccess}
                className="shrink-0"
              />
            </div>
            <TxReceipt hash={withdrawHook.hash} isSuccess={withdrawHook.isSuccess} error={withdrawHook.error} successLabel="Claimed to your wallet" />
          </div>
        )}

        {/* ── Milestones ───────────────────────────────────────────── */}
        <div className="panel mb-6 p-5 sm:p-7">
          <div className="relative z-10 mb-6 flex items-end justify-between gap-3">
            <div>
              <span className="eyebrow">Delivery ledger</span>
              <h2 className="display mt-2 text-2xl font-semibold" style={{ color: 'var(--ink)' }}>Milestones</h2>
            </div>
            <span className="rounded-full border px-2.5 py-1 text-xs tabular-nums"
              style={{ borderColor: 'var(--border)', color: 'var(--subtle)' }}>
              {count} total
            </span>
          </div>
          {count === 0 ? (
            <p className="text-xs" style={{ color: 'var(--muted)' }}>No milestones found.</p>
          ) : (
            <div className="relative z-10">
              {Array.from({ length: count }, (_, i) => BigInt(i)).map((idx, i) => (
                <MilestoneRow
                  key={`${agreementId.toString()}-${idx.toString()}`}
                  agreementId={agreementId}
                  milestoneIndex={idx}
                  isLast={i === count - 1}
                  role={role}
                  isFunded={isFunded}
                  agreementActive={isActive}
                  cancelledUnfunded={cancelledUnfunded}
                  parentBusy={agreementBusy}
                  onTxConfirmed={() => refreshOnce()}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Cancel ──────────────────────────────────────────────── */}
        {role === 'funder' && isActive && (
          <div className="panel-flat p-5 sm:p-6">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--subtle)' }}>
              Administrative control
            </h3>
            <p className="mb-3 text-xs text-pretty" style={{ color: 'var(--muted)' }}>
              Only allowed when no milestones are Submitted, Approved, or Disputed. Pending milestone funds return to your claimable balance.
            </p>
            <TxButton label="Cancel Agreement" variant="danger" onClick={() => cancel.cancel(agreementId)} isPending={cancel.isPending} isConfirming={cancel.isConfirming} disabled={agreementBusy} />
            <TxReceipt hash={cancel.hash} isSuccess={cancel.isSuccess} error={cancel.error} successLabel="Agreement cancelled" />
          </div>
        )}

      </motion.div>
    </div>
  )
}
