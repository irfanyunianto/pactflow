import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, ArrowLeft, Info, AlertTriangle, Copy, Check } from 'lucide-react'
import { toast } from 'sonner'
import { isAddress } from 'viem'
import { useAccount } from 'wagmi'
import { useCreateAgreement, useAgreementCount } from '@/hooks/usePactFlow'
import { TxButton } from '@/components/ui/TxButton'
import { TxReceipt } from '@/components/ui/TxReceipt'
import { formatUSDC } from '@/utils/format'
import { parseUSDC } from '@/utils/parseUSDC'
import { validateAgreementForm } from '@/utils/validateAgreement'

function getMinDateStr(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}
const MODULE_MIN_DATE = getMinDateStr()

interface MilestoneInput { description: string; amount: string; deadline: string }
interface CreateAgreementProps { onBack: () => void; onCreated: (id: bigint) => void }

// ── Field wrapper ─────────────────────────────────────────────────────────────
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <label className="mb-1.5 block text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px]" style={{ color: 'var(--subtle)' }}>{hint}</p>}
    </div>
  )
}

// ── Read-only funder address with truncation + copy ───────────────────────────
function FunderDisplay({ address }: { address: string | undefined }) {
  const [copied, setCopied] = useState(false)
  function handleCopy() {
    if (!address) return
    void navigator.clipboard.writeText(address).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }
  if (!address) {
    return (
      <div className="mono rounded-xl border px-3 py-2.5 text-sm"
        style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--subtle)' }}>
        Connect wallet
      </div>
    )
  }
  // Truncate: show first 6 + last 4 chars
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2.5"
      style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}>
      <span className="mono min-w-0 flex-1 truncate text-sm" style={{ color: 'var(--muted)' }}
        title={address}>
        {short}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        className="shrink-0 rounded-md p-1 transition-colors hover:bg-white/10"
        style={{ color: copied ? 'var(--success)' : 'var(--subtle)' }}
        aria-label="Copy funder address"
        title={address}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  )
}

// ── Address input with validation indicator ───────────────────────────────────
function AddressInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const valid = value.length > 0 && isAddress(value)
  const invalid = value.length > 0 && !isAddress(value)
  return (
    <div className="relative min-w-0">
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="mono w-full rounded-xl border bg-transparent py-2.5 pl-3 pr-10 text-sm transition-colors placeholder:text-[var(--subtle)]"
        style={{
          borderColor: invalid ? 'var(--danger)' : valid ? 'var(--success)' : 'var(--border)',
          color: 'var(--ink)',
        }}
        spellCheck={false}
      />
      {(valid || invalid) && (
        <span
          className="absolute right-3 top-1/2 size-2 -translate-y-1/2 rounded-full"
          style={{ background: valid ? 'var(--success)' : 'var(--danger)' }}
        />
      )}
    </div>
  )
}

export function CreateAgreement({ onBack, onCreated }: CreateAgreementProps) {
  const { address } = useAccount()
  const { data: agreementCountBefore } = useAgreementCount()
  const [builder, setBuilder]   = useState('')
  const [arbitrator, setArbitrator] = useState('')
  const [milestones, setMilestones] = useState<MilestoneInput[]>([{ description: '', amount: '', deadline: '' }])
  const [validationError, setValidationError] = useState<string | null>(null)

  const { create, hash, isPending, isConfirming, isSuccess, error } = useCreateAgreement()

  React.useEffect(() => {
    if (isSuccess && agreementCountBefore !== undefined && agreementCountBefore !== null) {
      const newId = typeof agreementCountBefore === 'bigint'
        ? agreementCountBefore
        : BigInt(Number(agreementCountBefore))
      setTimeout(() => onCreated(newId), 600)
    }
  }, [isSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  function addMilestone() {
    if (milestones.length >= 20) { toast.error('Maximum 20 milestones per agreement'); return }
    setMilestones(m => [...m, { description: '', amount: '', deadline: '' }])
  }
  function removeMilestone(i: number) { setMilestones(m => m.filter((_, idx) => idx !== i)) }
  function updateMilestone(i: number, key: keyof MilestoneInput, value: string) {
    setMilestones(m => m.map((item, idx) => idx === i ? { ...item, [key]: value } : item))
  }
  function totalAmount(): bigint { return milestones.reduce((s, m) => s + parseUSDC(m.amount), 0n) }

  function handleCreate() {
    const err = validateAgreementForm(address, builder, arbitrator, milestones)
    if (err) { setValidationError(err); toast.error(err); return }
    setValidationError(null)
    create({
      builder: builder as `0x${string}`,
      arbitrator: arbitrator as `0x${string}`,
      milestones: milestones.map(m => ({
        description: m.description,
        amount: parseUSDC(m.amount),
        deadline: BigInt(Math.floor(new Date(m.deadline).getTime() / 1000)),
      })),
    })
  }

  const total = totalAmount()

  return (
    <div className="mx-auto w-full max-w-[680px] px-4 py-8 sm:px-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.26 }}>

        <button
          onClick={onBack}
          className="mb-6 flex items-center gap-1.5 text-sm transition-colors hover:text-[var(--ink)]"
          style={{ color: 'var(--muted)' }}
        >
          <ArrowLeft className="size-4" /> Back to dashboard
        </button>

        <h1 className="display mb-1 text-2xl font-bold" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
          Create Agreement
        </h1>
        <p className="mb-7 text-sm text-pretty" style={{ color: 'var(--muted)' }}>
          Define roles, milestones, and amounts. You fund the escrow after creation.
        </p>

        {/* ── Roles ───────────────────────────────────────────────── */}
        <section className="mb-4 rounded-2xl border p-5" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--subtle)' }}>
            Participants
          </h2>
          <div className="space-y-4">
            <Field label="Funder (you)">
              <FunderDisplay address={address} />
            </Field>
            <Field label="Builder address" hint="The wallet that will submit evidence and receive released payments.">
              <AddressInput value={builder} onChange={setBuilder} placeholder="0x…" />
            </Field>
            <Field label="Arbitrator address" hint="Neutral third party — can only act when a dispute is raised. Cannot access funds independently.">
              <AddressInput value={arbitrator} onChange={setArbitrator} placeholder="0x…" />
            </Field>
          </div>
        </section>

        {/* ── Milestones ──────────────────────────────────────────── */}
        <section className="mb-4 rounded-2xl border p-5" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--subtle)' }}>
              Milestones <span className="ml-1 tabular-nums" style={{ color: 'var(--muted)' }}>({milestones.length}/20)</span>
            </h2>
            <button
              onClick={addMilestone}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-white/5"
              style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}
            >
              <Plus className="size-3.5" /> Add
            </button>
          </div>

          <AnimatePresence initial={false}>
            {milestones.map((m, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6, transition: { duration: 0.15 } }}
                transition={{ duration: 0.22 }}
                className={`rounded-xl border p-4 ${i < milestones.length - 1 ? 'mb-3' : ''}`}
                style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--silver)' }}>
                    Milestone {i + 1}
                  </span>
                  {milestones.length > 1 && (
                    <button
                      onClick={() => removeMilestone(i)}
                      className="rounded-lg p-1 transition-colors hover:bg-[var(--danger-bg)]"
                      style={{ color: 'var(--subtle)' }}
                      aria-label="Remove milestone"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs" style={{ color: 'var(--muted)' }}>Description</label>
                    <input
                      value={m.description}
                      onChange={e => updateMilestone(i, 'description', e.target.value)}
                      placeholder="What should be delivered?"
                      maxLength={256}
                      className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm transition-colors placeholder:text-[var(--subtle)]"
                      style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs" style={{ color: 'var(--muted)' }}>Amount (USDC)</label>
                      <div className="relative">
                        <input
                          inputMode="decimal"
                          value={m.amount}
                          onChange={e => {
                            const v = e.target.value.replace(/[^0-9.]/g, '')
                            if (v === '' || /^\d*\.?\d*$/.test(v)) updateMilestone(i, 'amount', v)
                          }}
                          placeholder="0.00"
                          className="w-full rounded-lg border bg-transparent py-2 pl-3 pr-12 text-sm tabular-nums transition-colors placeholder:text-[var(--subtle)]"
                          style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold"
                          style={{ color: 'var(--subtle)' }}>USDC</span>
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs" style={{ color: 'var(--muted)' }}>Deadline</label>
                      <input
                        type="date"
                        value={m.deadline}
                        min={MODULE_MIN_DATE}
                        onChange={e => updateMilestone(i, 'deadline', e.target.value)}
                        className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm transition-colors"
                        style={{ borderColor: 'var(--border)', color: 'var(--ink)', colorScheme: 'dark' }}
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Total */}
          <div className="mt-4 flex items-center justify-between border-t pt-4" style={{ borderColor: 'var(--border)' }}>
            <span className="text-sm font-semibold" style={{ color: 'var(--muted)' }}>Total to escrow</span>
            <span className="display text-xl font-bold tabular-nums" style={{ color: total > 0n ? 'var(--ink)' : 'var(--subtle)' }}>
              {formatUSDC(total)}
              <span className="ml-1 text-sm font-normal" style={{ color: 'var(--subtle)' }}>USDC</span>
            </span>
          </div>
        </section>

        {/* ── Evidence notice ──────────────────────────────────────── */}
        <div className="mb-6 flex gap-2.5 rounded-xl border px-3.5 py-3"
          style={{ background: 'rgba(172,198,233,0.05)', borderColor: 'rgba(172,198,233,0.18)' }}>
          <Info className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--accent)' }} />
          <p className="text-xs text-pretty" style={{ color: 'var(--muted)' }}>
            <strong style={{ color: 'var(--ink-2)' }}>Evidence policy:</strong> Builders submit evidence URLs per milestone. An evidence URL is an on-chain record only — it does not automatically release funds or prove quality. Only you (the funder) can approve and release each milestone.
          </p>
        </div>

        <TxButton
          label="Create Agreement"
          onClick={handleCreate}
          isPending={isPending}
          isConfirming={isConfirming}
          className="w-full py-3.5 text-base"
        />

        {/* Inline validation error — persists until corrected, unlike a toast */}
        {validationError && !isPending && !isConfirming && !isSuccess && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border px-3.5 py-2.5"
            style={{ background: 'var(--danger-bg)', borderColor: 'var(--danger-border)' }}>
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" style={{ color: 'var(--danger)' }} />
            <p className="text-sm" style={{ color: 'var(--danger)' }}>{validationError}</p>
          </div>
        )}

        <TxReceipt hash={hash} isSuccess={isSuccess} error={error} successLabel="Agreement created — opening…" />

      </motion.div>
    </div>
  )
}
