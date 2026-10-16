import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, ArrowRight, Wallet2, AlertTriangle, Layers, Lock,
  CheckCircle2, ChevronDown, ChevronUp, Users, Scale, Banknote,
  ShieldCheck, FileCheck2,
} from 'lucide-react'
import { useAccount, useReadContracts } from 'wagmi'
import type { Abi } from 'viem'
import { formatUSDC, formatUSDCOrZero, shortenAddress } from '@/utils/format'
import { useAgreementCount, usePendingWithdrawals, useWithdraw, useRefetchGroup } from '@/hooks/usePactFlow'
import type { RefetchFn } from '@/hooks/usePactFlow'
import { computeDashboardStats } from '@/utils/dashboardAggregation'
import { agreementStatusBadge } from '@/components/ui/Badge'
import { TxButton } from '@/components/ui/TxButton'
import { TxReceipt } from '@/components/ui/TxReceipt'
import { AgreementStatus, MilestoneStatus, PACTFLOW_ADDRESS, PACTFLOW_ABI, ARC_TESTNET_CHAIN_ID } from '@/contracts/pactflow'
import type { AgreementData } from '@/types/pactflow'
import { EscrowFlowVisual } from '@/components/visuals/ProtocolVisuals'

import { collectAgreementReads, getAgreementRole, selectDashboardAgreements } from '@/utils/dashboardScope'
import type { AgreementScope, AgreementFilter } from '@/utils/dashboardScope'

const AS = {
  Active:    Number(AgreementStatus.Active),
  Completed: Number(AgreementStatus.Completed),
  Cancelled: Number(AgreementStatus.Cancelled),
} as const
const MS = {
  Released: Number(MilestoneStatus.Released),
  Refunded: Number(MilestoneStatus.Refunded),
  Disputed: Number(MilestoneStatus.Disputed),
  Submitted: Number(MilestoneStatus.Submitted),
  Approved:  Number(MilestoneStatus.Approved),
  Pending:   Number(MilestoneStatus.Pending),
} as const

const fadeUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
}
const ease = [0.25, 0.1, 0.25, 1] as const

const stagger = {
  container: { animate: { transition: { staggerChildren: 0.055 } } },
  item: {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.24, ease } },
  },
}

interface DashboardProps {
  onCreateAgreement: () => void
  onOpenAgreement: (id: bigint) => void
}

// ── How It Works ──────────────────────────────────────────────────────────────
// Dismissible, collapsed by default on small screens. Explains the three roles
// and the separate Claim step without fabricating any numbers.
function HowItWorks() {
  const [open, setOpen] = useState(true)
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  return (
    <motion.div
      {...fadeUp}
      transition={{ duration: 0.26, ease }}
      className="panel-flat mb-6 overflow-hidden"
    >
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
        aria-expanded={open}
      >
        <span>
          <span className="eyebrow">Protocol path</span>
          <span className="mt-1.5 block text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>
            One agreement, deliberate release controls
          </span>
        </span>
        <span className="flex items-center gap-2" style={{ color: 'var(--subtle)' }}>
          {open
            ? <ChevronUp  className="size-3.5" />
            : <ChevronDown className="size-3.5" />}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="how"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="grid gap-3 border-t px-5 pb-5 pt-4 sm:grid-cols-3"
              style={{ borderColor: 'var(--border)' }}>

              {/* Funder */}
              <div className="border-l-2 py-1 pl-4" style={{ borderColor: 'var(--border-strong)' }}>
                <div className="mb-1.5 flex items-center gap-2">
                  <Lock className="size-3.5" style={{ color: 'var(--silver)' }} />
                  <span className="text-xs font-semibold" style={{ color: 'var(--silver)' }}>Funder</span>
                </div>
                <p className="text-xs text-pretty leading-relaxed" style={{ color: 'var(--muted)' }}>
                  Creates the agreement, deposits USDC into escrow, and reviews submitted evidence. Approves milestones and authorises payment release.
                </p>
              </div>

              {/* Builder */}
              <div className="border-l-2 py-1 pl-4" style={{ borderColor: 'var(--accent)' }}>
                <div className="mb-1.5 flex items-center gap-2">
                  <Banknote className="size-3.5" style={{ color: 'var(--accent)' }} />
                  <span className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>Builder</span>
                </div>
                <p className="text-xs text-pretty leading-relaxed" style={{ color: 'var(--muted)' }}>
                  Submits an evidence URL for each milestone. Once the funder approves and releases funds, the builder claims USDC to their wallet in a separate step.
                </p>
              </div>

              {/* Arbitrator */}
              <div className="border-l-2 py-1 pl-4" style={{ borderColor: 'var(--warning)' }}>
                <div className="mb-1.5 flex items-center gap-2">
                  <Scale className="size-3.5" style={{ color: 'var(--warning)' }} />
                  <span className="text-xs font-semibold" style={{ color: 'var(--warning)' }}>Arbitrator</span>
                </div>
                <p className="text-xs text-pretty leading-relaxed" style={{ color: 'var(--muted)' }}>
                  A trusted third party who resolves disputes between funder and builder. All three roles must be different addresses.
                </p>
              </div>

              {/* Claim note */}
              <div className="border-t p-4 sm:col-span-3" style={{ borderColor: 'var(--border)' }}>
                <div className="mb-1.5 flex items-center gap-2">
                  <Wallet2 className="size-3.5" style={{ color: 'var(--accent)' }} />
                  <span className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Separate Claim Step</span>
                </div>
                <p className="text-xs text-pretty leading-relaxed" style={{ color: 'var(--muted)' }}>
                  Released or refunded USDC is held in a claimable balance inside the contract — it does not go to your wallet automatically. You must claim it. The claimable balance appears on your dashboard and on each agreement when you are the recipient.
                </p>
              </div>
            </div>

            <div className="flex justify-end border-t px-4 py-2" style={{ borderColor: 'var(--border)' }}>
              <button
                onClick={() => setDismissed(true)}
                className="text-[11px] transition-colors hover:text-[var(--muted)]"
                style={{ color: 'var(--subtle)' }}
              >
                Dismiss
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── Stat chip ─────────────────────────────────────────────────────────────────
function StatChip({ icon, label, value, sub, loading }: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  loading?: boolean
}) {
  return (
    <div className="metric-card flex flex-col justify-between gap-3">
      <div className="flex items-center justify-between gap-2" style={{ color: 'var(--subtle)' }}>
        <span className="text-[10px] font-bold uppercase tracking-[0.13em]">{label}</span>
        <span className="metric-card__icon">{icon}</span>
      </div>
      {loading
        ? <div className="skeleton h-7 w-24 rounded" />
        : <span className="display text-2xl font-semibold tabular-nums leading-none" style={{ color: 'var(--ink)' }}>{value}</span>
      }
      {sub && !loading && (
        <span className="text-[11px] leading-tight" style={{ color: 'var(--subtle)' }}>{sub}</span>
      )}
    </div>
  )
}

// ── Filter tab ────────────────────────────────────────────────────────────────
function FilterTab({ label, active, count, onClick }: {
  label: string; active: boolean; count?: number; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold"
      style={active
        ? { background: 'var(--accent-glow)', borderColor: 'rgba(93,74,184,0.32)', color: 'var(--accent-deep)' }
        : { background: 'transparent', borderColor: 'var(--border)', color: 'var(--muted)' }
      }
    >
      {label}
      {count !== undefined && (
        <span
          className="flex size-4 items-center justify-center rounded-full text-[10px] tabular-nums"
          style={active
            ? { background: 'rgba(93,74,184,0.13)', color: 'var(--accent-deep)' }
            : { background: 'var(--surface-muted)', color: 'var(--subtle)' }
          }
        >
          {count}
        </span>
      )}
    </button>
  )
}

// ── Terminal-state summary for a card ─────────────────────────────────────────
// Returns a short neutral factual line about a resolved agreement.
function terminalSummary(ag: AgreementData): string | null {
  const agStatus = Number(ag.status)
  const msArray  = Array.isArray(ag.milestones) ? ag.milestones : []
  if (agStatus === AS.Active) return null

  const releasedCount  = msArray.filter(m => Number(m.status) === MS.Released).length
  const refundedCount  = msArray.filter(m => Number(m.status) === MS.Refunded).length
  const releasedAmount = msArray
    .filter(m => Number(m.status) === MS.Released)
    .reduce((s, m) => s + (m.amount ?? 0n), 0n)

  if (agStatus === AS.Completed) {
    if (releasedCount > 0)
      return `${releasedCount} milestone${releasedCount > 1 ? 's' : ''} · ${formatUSDC(releasedAmount)} USDC paid`
    return 'All milestones resolved'
  }

  if (agStatus === AS.Cancelled) {
    if (!ag.isFunded) return 'Cancelled before funding — no funds at risk'
    if (refundedCount > 0)
      return `Cancelled · ${refundedCount} milestone${refundedCount > 1 ? 's' : ''} refunded`
    return 'Cancelled after funding'
  }

  return null
}

// ── Agreement card ────────────────────────────────────────────────────────────
function AgreementCard({ agreementId, agreement: ag, onOpen }: {
  agreementId: bigint; agreement: AgreementData; onOpen: (id: bigint) => void
}) {
  const { address } = useAccount()

  const { funder, builder, status, milestones, totalAmount, isFunded } = ag
  const agStatus      = Number(status)
  const isTerminal    = agStatus !== AS.Active
  const msArray       = Array.isArray(milestones) ? milestones : []

  const releasedCount  = msArray.filter(m => Number(m.status) === MS.Released).length
  const disputedCount  = msArray.filter(m => Number(m.status) === MS.Disputed).length
  const submittedCount = msArray.filter(m =>
    Number(m.status) === MS.Submitted || Number(m.status) === MS.Approved).length
  const progress       = msArray.length > 0 ? releasedCount / msArray.length : 0

  const myRole = getAgreementRole(ag, address)

  const actionHint: string | null = (() => {
    if (!myRole || agStatus !== AS.Active) return null
    if (myRole === 'funder'     && !isFunded)          return 'Fund escrow to activate'
    if (myRole === 'funder'     && submittedCount > 0)  return `${submittedCount} milestone${submittedCount > 1 ? 's' : ''} awaiting review`
    if (myRole === 'builder'    && isFunded && msArray.some(m => Number(m.status) === MS.Pending))
      return 'Submit evidence for pending milestones'
    if (myRole === 'arbitrator' && disputedCount > 0)   return `${disputedCount} dispute${disputedCount > 1 ? 's' : ''} to resolve`
    return null
  })()

  const summary = terminalSummary(ag)

  return (
    <motion.button
      variants={stagger.item}
      onClick={() => onOpen(agreementId)}
      className="agreement-card group w-full p-5 text-left"
      whileHover={{ borderColor: 'rgba(93,74,184,0.36)' }}
      whileTap={{ scale: 0.995 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Title row */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="display text-base font-semibold" style={{ color: 'var(--ink)' }}>
              Agreement #{agreementId.toString()}
            </span>
            {agreementStatusBadge(agStatus)}
            {disputedCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                style={{ borderColor: 'var(--warning-border)', color: 'var(--warning)', background: 'var(--warning-bg)' }}>
                <AlertTriangle className="size-2.5" /> {disputedCount} disputed
              </span>
            )}
          </div>

          {/* Address row */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            {funder && (
              <span className="text-xs" style={{ color: 'var(--subtle)' }}>
                Funder <span className="mono" style={{ color: 'var(--muted)' }}>{shortenAddress(funder)}</span>
              </span>
            )}
            {builder && (
              <span className="text-xs" style={{ color: 'var(--subtle)' }}>
                Builder <span className="mono" style={{ color: 'var(--muted)' }}>{shortenAddress(builder)}</span>
              </span>
            )}
            {myRole && (
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>
                You: {myRole}
              </span>
            )}
          </div>

          {/* Progress bar — only for active funded agreements */}
          {msArray.length > 0 && !isTerminal && isFunded && (
            <div className="mt-4 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--border)' }}>
                <div
                  className="progress-fill h-full rounded-full"
                  style={{
                    width: `${Math.round(progress * 100)}%`,
                    background: progress === 1 ? 'var(--success)' : 'var(--accent)',
                  }}
                />
              </div>
              <span className="shrink-0 text-[10px] tabular-nums" style={{ color: 'var(--subtle)' }}>
                {releasedCount}/{msArray.length}
              </span>
            </div>
          )}

          {/* Action hint for active agreements, or terminal summary */}
          {actionHint && (
            <p className="mt-1.5 text-[11px] font-medium" style={{ color: 'var(--accent)' }}>
              {actionHint}
            </p>
          )}
          {!actionHint && summary && (
            <p className="mt-1.5 text-[11px]" style={{ color: 'var(--subtle)' }}>
              {summary}
            </p>
          )}
        </div>

        {/* Right: value + funding state */}
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="display text-lg font-semibold tabular-nums" style={{ color: 'var(--ink-2)' }}>
            {formatUSDC(totalAmount ?? 0n)}
            <span className="ml-0.5 text-xs font-normal" style={{ color: 'var(--subtle)' }}> USDC</span>
          </div>
          {!isFunded && agStatus === AS.Active && (
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--warning)' }}>
              Awaiting funding
            </span>
          )}
          <span className="flex size-8 items-center justify-center rounded-full border opacity-60 group-hover:opacity-100"
            style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}>
            <ArrowRight className="size-3.5" />
          </span>
        </div>
      </div>
    </motion.button>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export function Dashboard(props: DashboardProps) {
  const { address, isConnected } = useAccount()
  // Reset scope, filters, and wallet-specific transaction presentation synchronously.
  // Global on-chain reads remain cached by their contract query keys.
  const walletKey = isConnected && address ? address.toLowerCase() : 'disconnected'
  return <DashboardContent key={walletKey} {...props} />
}

function DashboardContent({ onCreateAgreement, onOpenAgreement }: DashboardProps) {
  const { address, isConnected } = useAccount()
  const { data: agreementCountRaw, isLoading: countLoading, isError: countError, refetch: _refetchCount } = useAgreementCount()
  const { data: pendingWithdrawRaw, refetch: _refetchPending } = usePendingWithdrawals(address)
  const { withdraw, hash, isPending, isConfirming, isSuccess, error, reset: resetWithdraw } = useWithdraw()
  const [filter, setFilter] = useState<AgreementFilter>('all')
  const [scope, setScope] = useState<AgreementScope>(isConnected && address ? 'mine' : 'all')
  const [retrying, setRetrying] = useState(false)

  const refetchCount   = _refetchCount   as RefetchFn
  const refetchPending = _refetchPending as RefetchFn

  const combinedRefetch = useCallback((): Promise<unknown> =>
    Promise.allSettled([refetchPending(), refetchCount()]),
  [refetchPending, refetchCount])
  const { syncAll: syncDashboard } = useRefetchGroup([combinedRefetch], { maxAttempts: 4, intervalMs: 1500 })

  const prevWithdraw = useRef(false)
  useEffect(() => {
    if (isSuccess && !prevWithdraw.current) {
      prevWithdraw.current = true
      void syncDashboard()
    }
    if (!isSuccess) prevWithdraw.current = false
  }, [isSuccess, syncDashboard])

  // Refresh count on mount — picks up agreements created while this was unmounted
  useEffect(() => {
    void refetchCount()
  // Only on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { resetWithdraw() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [address])

  const countLoaded = !countLoading && !countError && agreementCountRaw !== undefined
  const totalAgreements = countLoaded ? Number(agreementCountRaw) : 0
  const pendingWithdraw = typeof pendingWithdrawRaw === 'bigint' ? pendingWithdrawRaw : 0n
  const withdrawLoaded = pendingWithdrawRaw !== undefined
  const ids = Array.from({ length: totalAgreements }, (_, i) => BigInt(i)).reverse()
  const registry = useReadContracts({
    contracts: ids.map(id => ({
      address: PACTFLOW_ADDRESS, abi: PACTFLOW_ABI as Abi,
      functionName: 'getAgreement', args: [id], chainId: ARC_TESTNET_CHAIN_ID,
    })),
    allowFailure: true,
    query: { enabled: countLoaded && totalAgreements > 0 },
  })
  const { agreements, errors, complete } = collectAgreementReads(ids, registry.data)
  const listError = countError || (countLoaded && totalAgreements > 0 && (registry.isError || errors.size > 0))
  const listReady = countLoaded && complete && !listError && !retrying
  const { totalLocked, totalReleased, activeCount } = computeDashboardStats(agreements, errors, totalAgreements)
  const { counts, filtered } = selectDashboardAgreements(agreements, scope, isConnected ? address : undefined, filter)

  async function retryAgreements() {
    setRetrying(true)
    try {
      // Refetch the failed records as well as the count. Refetching only the count
      // leaves successful-but-partial multicall responses cached indefinitely.
      await Promise.allSettled([refetchCount(), ...(totalAgreements > 0 ? [registry.refetch()] : [])])
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div className="page-shell">
      <section className="mb-10 grid items-center gap-9 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
        <motion.div {...fadeUp} transition={{ duration: 0.32, ease }} className="py-2 lg:py-8">
          <span className="eyebrow">Milestone escrow · Arc Testnet</span>
          <h1 className="display mt-5 max-w-[11ch] text-[2.75rem] font-extrabold leading-[0.96] text-balance sm:text-6xl"
            style={{ color: 'var(--ink)' }}>
            Fund the work. Review each release.
          </h1>
          <p className="mt-5 max-w-[56ch] text-[15px] leading-7 text-pretty sm:text-base" style={{ color: 'var(--muted)' }}>
            A deliberate workspace for milestone funding. Define the pact, escrow USDC, review evidence, then approve and release in two distinct steps.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              onClick={onCreateAgreement}
              disabled={!isConnected}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: 'var(--action)', color: '#f4effa', boxShadow: '0 9px 20px rgba(73,57,149,0.14)' }}
            >
              <Plus className="size-4" /> Create agreement
            </button>
            <button
              onClick={() => document.getElementById('agreements')?.scrollIntoView()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-5 text-sm font-semibold"
              style={{ borderColor: 'var(--border)', background: 'var(--paper)', color: 'var(--ink-2)' }}
            >
              View live agreements <ArrowRight className="size-4" />
            </button>
          </div>

          <div className="mt-7 grid max-w-xl gap-3 border-t pt-5 sm:grid-cols-2" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--accent)' }} />
              <p className="text-xs leading-relaxed" style={{ color: 'var(--subtle)' }}>
                Role permissions and escrow rules are enforced by the deployed contract.
              </p>
            </div>
            <div className="flex items-start gap-2.5">
              <FileCheck2 className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--accent)' }} />
              <p className="text-xs leading-relaxed" style={{ color: 'var(--subtle)' }}>
                Evidence records never auto-approve or automatically release funds.
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.42, delay: 0.05, ease }}
        >
          <EscrowFlowVisual />
        </motion.div>
      </section>

      <div className="mb-7 flex flex-col gap-2 border-y py-3 text-[10px] font-semibold uppercase tracking-[0.12em] sm:flex-row sm:items-center sm:justify-between"
        style={{ borderColor: 'var(--border)', color: 'var(--subtle)' }}>
        <span>Community prototype · Arc Testnet only</span>
        <span>Future Rialo integration planned · Not affiliated with or deployed on Rialo</span>
      </div>

      {/* ── How It Works ─────────────────────────────────────────── */}
      <HowItWorks />

      {/* ── Stats row ────────────────────────────────────────────── */}
      {totalAgreements > 0 && (
        <motion.div
          {...fadeUp}
          transition={{ duration: 0.26, delay: 0.05, ease }}
          className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-3"
        >
          {listError ? (
            // One or more agreement reads failed — show "unavailable", not partial sums
            <div className="col-span-3 flex items-center justify-between gap-3 rounded-xl border px-4 py-3"
              style={{ background: 'var(--warning-bg)', borderColor: 'var(--warning-border)' }}>
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-4 shrink-0" style={{ color: 'var(--warning)' }} />
                <span className="text-xs font-medium" style={{ color: 'var(--ink-2)' }}>
                  Totals unavailable — one or more agreement reads failed
                </span>
              </div>
              <button
                onClick={() => void retryAgreements()}
                disabled={retrying}
                className="shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold"
                style={{ borderColor: 'var(--warning-border)', color: 'var(--warning)', background: 'transparent' }}
              >
                {retrying ? 'Retrying…' : 'Retry'}
              </button>
            </div>
          ) : (
            <>
              <StatChip
                icon={<Lock className="size-3" />}
                label="Global · Locked in Escrow"
                value={`$${formatUSDCOrZero(listReady ? totalLocked : undefined)}`}
                sub="active funded agreements"
                loading={!listReady}
              />
              <StatChip
                icon={<CheckCircle2 className="size-3" />}
                label="Global · Released to Builders"
                value={`$${formatUSDCOrZero(listReady ? totalReleased : undefined)}`}
                sub="across all agreements"
                loading={!listReady}
              />
              <StatChip
                icon={<Users className="size-3" />}
                label="Global · Active Agreements"
                value={String(activeCount)}
                sub={`of ${totalAgreements} total · global`}
                loading={!listReady}
              />
            </>
          )}
        </motion.div>
      )}

      {/* ── Claimable balance ─────────────────────────────────────── */}
      <AnimatePresence>
        {isConnected && withdrawLoaded && pendingWithdraw > 0n && (
          <motion.div
            key="claimable"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.22 }}
            className="panel-flat mb-6 p-5"
            style={{ background: 'var(--success-bg)', borderColor: 'var(--success-border)' }}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: 'var(--success-bg)' }}>
                  <Wallet2 className="size-5" style={{ color: 'var(--success)' }} />
                </div>
                <div>
                  <p className="text-xs font-semibold" style={{ color: 'var(--success)' }}>
                    Your Wallet · Claimable Balance
                  </p>
                  <p className="display text-xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                    {formatUSDC(pendingWithdraw)}
                    <span className="ml-1 text-sm font-normal" style={{ color: 'var(--muted)' }}>USDC</span>
                  </p>
                  <p className="mt-0.5 text-[11px]" style={{ color: 'var(--muted)' }}>
                    Funds held in contract — not yet in your wallet
                  </p>
                </div>
              </div>
              <TxButton
                label="Claim"
                loadingLabel="Claiming…"
                confirmingLabel="Confirming…"
                onClick={withdraw}
                isPending={isPending}
                isConfirming={isConfirming}
                className="shrink-0"
              />
            </div>
            <TxReceipt hash={hash} isSuccess={isSuccess} error={error} successLabel="Funds claimed to your wallet" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Create CTA ───────────────────────────────────────────── */}
      <motion.div
        {...fadeUp}
        transition={{ duration: 0.24, delay: 0.1, ease }}
        className="mb-8"
      >
        <button
          onClick={onCreateAgreement}
          disabled={!isConnected}
          className="group flex w-full items-center gap-4 rounded-xl border border-dashed p-4 text-left hover:bg-white/[0.025] disabled:cursor-not-allowed disabled:opacity-40 sm:p-5"
          style={{ borderColor: isConnected ? 'rgba(93,74,184,0.3)' : 'var(--border)', background: 'var(--surface)' }}
        >
          <div
            className="flex size-11 shrink-0 items-center justify-center rounded-xl border group-hover:scale-105"
            style={{ background: 'var(--accent-glow)', borderColor: 'rgba(93,74,184,0.2)', transition: 'transform 0.18s ease' }}
          >
            <Plus className="size-5" style={{ color: 'var(--accent)' }} />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>Start a new escrow</p>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              {isConnected
                ? 'Define milestones, fund escrow, track delivery'
                : 'Connect wallet to create an agreement'}
            </p>
          </div>
        </button>
      </motion.div>

      {/* ── Agreement list ───────────────────────────────────────── */}
      <motion.div
        id="agreements"
        {...fadeUp}
        transition={{ duration: 0.24, delay: 0.14, ease }}
      >
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <span className="eyebrow">On-chain registry</span>
            <h2 className="display mt-2 text-2xl font-semibold" style={{ color: 'var(--ink)' }}>Agreements</h2>
          </div>
          {listReady && (
            <span className="rounded-full border px-2.5 py-1 text-xs tabular-nums" style={{ borderColor: 'var(--border)', color: 'var(--subtle)' }}>
              {counts.all} in scope
            </span>
          )}
        </div>

        <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Agreement scope">
          {isConnected && address && (
            <FilterTab label="My agreements" active={scope === 'mine'} onClick={() => setScope('mine')} />
          )}
          <FilterTab label="All agreements" active={scope === 'all'} onClick={() => setScope('all')} />
        </div>
        <p className="mb-4 text-xs" style={{ color: 'var(--subtle)' }}>
          {scope === 'mine' && address
            ? `Agreements involving ${shortenAddress(address)} as funder, builder, or arbitrator.`
            : 'All agreements in the on-chain registry.'}
          {' '}Statistics above are global; claimable balance belongs to your wallet.
        </p>
        <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Agreement status">
          {(['all', 'active', 'completed', 'cancelled'] as const).map(status => (
            <FilterTab key={status} label={status[0].toUpperCase() + status.slice(1)}
              active={filter === status} count={listReady ? counts[status] : undefined}
              onClick={() => setFilter(status)} />
          ))}
        </div>

        {listError ? (
          <div className="panel-flat p-8 text-center" style={{ borderColor: 'var(--warning-border)' }}>
            <AlertTriangle className="mx-auto mb-2 size-6" style={{ color: 'var(--warning)' }} />
            <p className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>
              Could not load agreements
            </p>
            <p className="mt-1 text-xs" style={{ color: 'var(--subtle)' }}>
              One or more network reads failed. The complete list and counts are unavailable.
            </p>
            <button
              onClick={() => void retryAgreements()}
              disabled={retrying}
              className="mt-3 rounded-lg border px-4 py-2 text-xs font-semibold"
              style={{ borderColor: 'var(--accent)', color: 'var(--accent)', background: 'transparent' }}
            >
              {retrying ? 'Retrying…' : 'Retry'}
            </button>
          </div>
        ) : !listReady ? (
          <div className="space-y-2.5" role="status" aria-label="Loading agreements">
            <span className="sr-only">Loading the complete agreement registry…</span>
            {[0, 1, 2].map(i => <div key={i} className="skeleton h-[118px] rounded-2xl" />)}
          </div>
        ) : counts.all === 0 ? (
          // Count confirmed zero — safe to show empty state
          <div className="panel-flat p-10 text-center sm:p-14">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl" style={{ background: 'var(--accent-glow)' }}>
              <Layers className="size-6" style={{ color: 'var(--accent)' }} />
            </div>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>{scope === 'mine' ? 'No agreements for this wallet' : 'No agreements yet'}</p>
            <p className="mt-1 text-xs" style={{ color: 'var(--subtle)' }}>
              {scope === 'mine' ? 'This wallet is not a funder, builder, or arbitrator in any agreement.' : 'Create the first agreement to start tracking milestones on-chain.'}
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="panel-flat p-8 text-center">
            <p className="text-sm" style={{ color: 'var(--muted)' }}>No {filter} agreements{scope === 'mine' ? ' for this wallet' : ''}.</p>
          </div>
        ) : (
          <motion.div
            className="space-y-3"
            variants={stagger.container}
            initial="initial"
            animate="animate"
          >
            {filtered.map(([id, agreement]) => (
              <AgreementCard key={id} agreementId={BigInt(id)} agreement={agreement} onOpen={onOpenAgreement} />
            ))}
          </motion.div>
        )}
      </motion.div>
    </div>
  )
}
