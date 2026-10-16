import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Trash2, ArrowLeft, Info, AlertTriangle, Copy, Check,
  Users, ListChecks, ShieldCheck, CircleDollarSign,
} from 'lucide-react'
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

interface MilestoneInput {
  description: string
  amount: string
  deadline: string
}

interface CreateAgreementProps {
  onBack: () => void
  onCreated: (id: bigint) => void
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--silver)' }}>
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: 'var(--subtle)' }}>{hint}</p> : null}
    </div>
  )
}

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
      <div className="mono rounded-xl border px-3.5 py-3 text-sm"
        style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--subtle)' }}>
        Connect wallet
      </div>
    )
  }

  const short = `${address.slice(0, 8)}…${address.slice(-6)}`
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl border px-3.5 py-3"
      style={{ background: 'var(--paper)', borderColor: 'var(--border)' }}>
      <span className="mono min-w-0 flex-1 truncate text-sm" style={{ color: 'var(--muted)' }} title={address}>
        {short}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        className="shrink-0 rounded-md p-1.5 hover:bg-black/5"
        style={{ color: copied ? 'var(--success)' : 'var(--subtle)' }}
        aria-label="Copy funder address"
        title={address}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  )
}

function AddressInput({ value, onChange, placeholder, label }: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  label: string
}) {
  const valid = value.length > 0 && isAddress(value)
  const invalid = value.length > 0 && !isAddress(value)

  return (
    <div className="relative min-w-0">
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="mono w-full rounded-xl border bg-transparent py-3 pl-3.5 pr-11 text-sm placeholder:text-[var(--subtle)]"
        style={{
          borderColor: invalid ? 'var(--danger)' : valid ? 'var(--success)' : 'var(--border)',
          color: 'var(--ink)',
        }}
        spellCheck={false}
      />
      {valid || invalid ? (
        <span
          className="absolute right-4 top-1/2 size-2 -translate-y-1/2 rounded-full"
          style={{ background: valid ? 'var(--success)' : 'var(--danger)' }}
        />
      ) : null}
    </div>
  )
}

export function CreateAgreement({ onBack, onCreated }: CreateAgreementProps) {
  const { address } = useAccount()
  const { data: agreementCountBefore } = useAgreementCount()
  const [builder, setBuilder] = useState('')
  const [arbitrator, setArbitrator] = useState('')
  const [milestones, setMilestones] = useState<MilestoneInput[]>([
    { description: '', amount: '', deadline: '' },
  ])
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
    if (milestones.length >= 20) {
      toast.error('Maximum 20 milestones per agreement')
      return
    }
    setMilestones(current => [...current, { description: '', amount: '', deadline: '' }])
  }

  function removeMilestone(index: number) {
    setMilestones(current => current.filter((_, itemIndex) => itemIndex !== index))
  }

  function updateMilestone(index: number, key: keyof MilestoneInput, value: string) {
    setMilestones(current => current.map((item, itemIndex) => (
      itemIndex === index ? { ...item, [key]: value } : item
    )))
  }

  function totalAmount(): bigint {
    return milestones.reduce((sum, milestone) => sum + parseUSDC(milestone.amount), 0n)
  }

  function handleCreate() {
    const validationResult = validateAgreementForm(address, builder, arbitrator, milestones)
    if (validationResult) {
      setValidationError(validationResult)
      toast.error(validationResult)
      return
    }

    setValidationError(null)
    create({
      builder: builder as `0x${string}`,
      arbitrator: arbitrator as `0x${string}`,
      milestones: milestones.map(milestone => ({
        description: milestone.description,
        amount: parseUSDC(milestone.amount),
        deadline: BigInt(Math.floor(new Date(milestone.deadline).getTime() / 1000)),
      })),
    })
  }

  const total = totalAmount()

  return (
    <div className="page-shell">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.26 }}>
        <button
          onClick={onBack}
          className="mb-7 flex items-center gap-2 text-sm hover:text-[var(--ink)]"
          style={{ color: 'var(--muted)' }}
        >
          <ArrowLeft className="size-4" /> Back to overview
        </button>

        <header className="mb-8 max-w-2xl">
          <span className="eyebrow">New agreement</span>
          <h1 className="display mt-3 text-3xl font-semibold sm:text-4xl" style={{ color: 'var(--ink)' }}>
            Define the work before funds move.
          </h1>
          <p className="mt-3 max-w-[62ch] text-sm leading-6 text-pretty" style={{ color: 'var(--muted)' }}>
            Assign the three roles, set clear delivery milestones, and review the complete escrow value before creating the agreement on-chain.
          </p>
        </header>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
          <div className="space-y-5">
            <section className="panel p-5 sm:p-6">
              <div className="relative z-10 mb-6 flex items-start gap-3">
                <span className="metric-card__icon"><Users className="size-4" /></span>
                <div>
                  <h2 className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>Participants</h2>
                  <p className="mt-1 text-xs" style={{ color: 'var(--subtle)' }}>Each role must use a distinct wallet address.</p>
                </div>
              </div>

              <div className="relative z-10 grid gap-5 md:grid-cols-2">
                <div className="md:col-span-2">
                  <Field label="Funder · You">
                    <FunderDisplay address={address} />
                  </Field>
                </div>
                <Field label="Builder" hint="Submits evidence and receives released payments.">
                  <AddressInput value={builder} onChange={setBuilder} placeholder="0x builder wallet" label="Builder wallet address" />
                </Field>
                <Field label="Arbitrator" hint="Resolves a dispute only after one is raised.">
                  <AddressInput value={arbitrator} onChange={setArbitrator} placeholder="0x arbitrator wallet" label="Arbitrator wallet address" />
                </Field>
              </div>
            </section>

            <section className="panel p-5 sm:p-6">
              <div className="relative z-10 mb-6 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="metric-card__icon"><ListChecks className="size-4" /></span>
                  <div>
                    <h2 className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>Milestone schedule</h2>
                    <p className="mt-1 text-xs" style={{ color: 'var(--subtle)' }}>{milestones.length} of 20 milestones</p>
                  </div>
                </div>
                <button
                  onClick={addMilestone}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-black/[0.03]"
                  style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}
                >
                  <Plus className="size-3.5" /> Add
                </button>
              </div>

              <AnimatePresence initial={false}>
                {milestones.map((milestone, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6, transition: { duration: 0.15 } }}
                    transition={{ duration: 0.22 }}
                    className="relative z-10 mb-3 rounded-xl border p-4 last:mb-0 sm:p-5"
                    style={{ background: index % 2 === 0 ? 'var(--paper-warm)' : 'var(--paper)', borderColor: 'var(--border)' }}
                  >
                    <div className="mb-4 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="flex size-7 items-center justify-center rounded-full border font-mono text-[10px]"
                          style={{ borderColor: 'var(--border-strong)', color: 'var(--accent)' }}>
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <span className="text-xs font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--silver)' }}>
                          Milestone
                        </span>
                      </div>
                      {milestones.length > 1 ? (
                        <button
                          onClick={() => removeMilestone(index)}
                          className="rounded-lg p-1.5 hover:bg-[var(--danger-bg)]"
                          style={{ color: 'var(--subtle)' }}
                          aria-label={`Remove milestone ${index + 1}`}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      ) : null}
                    </div>

                    <div className="space-y-4">
                      <Field label="Deliverable">
                        <input
                          value={milestone.description}
                          onChange={event => updateMilestone(index, 'description', event.target.value)}
                          placeholder="What should be delivered?"
                          aria-label={`Milestone ${index + 1} deliverable`}
                          maxLength={256}
                          className="w-full rounded-xl border bg-transparent px-3.5 py-3 text-sm placeholder:text-[var(--subtle)]"
                          style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
                        />
                      </Field>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Escrow amount">
                          <div className="relative">
                            <input
                              inputMode="decimal"
                              value={milestone.amount}
                              onChange={event => {
                                const nextValue = event.target.value.replace(/[^0-9.]/g, '')
                                if (nextValue === '' || /^\d*\.?\d*$/.test(nextValue)) {
                                  updateMilestone(index, 'amount', nextValue)
                                }
                              }}
                              placeholder="0.00"
                              aria-label={`Milestone ${index + 1} escrow amount in USDC`}
                              className="w-full rounded-xl border bg-transparent py-3 pl-3.5 pr-14 text-sm tabular-nums placeholder:text-[var(--subtle)]"
                              style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
                            />
                            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] font-bold tracking-wider"
                              style={{ color: 'var(--subtle)' }}>
                              USDC
                            </span>
                          </div>
                        </Field>

                        <Field label="Deadline">
                          <input
                            type="date"
                            value={milestone.deadline}
                            min={MODULE_MIN_DATE}
                            aria-label={`Milestone ${index + 1} deadline`}
                            onChange={event => updateMilestone(index, 'deadline', event.target.value)}
                            className="w-full rounded-xl border bg-transparent px-3.5 py-3 text-sm"
                            style={{ borderColor: 'var(--border)', color: 'var(--ink)', colorScheme: 'light' }}
                          />
                        </Field>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </section>

            <div className="flex gap-3 rounded-2xl border px-4 py-4"
              style={{ background: 'var(--accent-glow)', borderColor: 'rgba(93,74,184,0.18)' }}>
              <Info className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--accent)' }} />
              <p className="text-xs leading-5 text-pretty" style={{ color: 'var(--muted)' }}>
                <strong style={{ color: 'var(--ink-2)' }}>Evidence stays under human review.</strong>
                {' '}A builder’s URL is recorded on-chain, but it never proves quality or releases funds automatically. The funder must approve and then release each milestone separately.
              </p>
            </div>
          </div>

          <aside className="lg:sticky lg:top-24">
            <div className="panel p-5 sm:p-6">
              <div className="relative z-10">
                <span className="eyebrow">Agreement preview</span>
                <div className="mt-5 rounded-2xl border p-4"
                  style={{ background: 'var(--paper-warm)', borderColor: 'var(--border)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--subtle)' }}>
                    Total to escrow
                  </p>
                  <p className="display mt-2 text-3xl font-semibold tabular-nums" style={{ color: total > 0n ? 'var(--ink)' : 'var(--subtle)' }}>
                    {formatUSDC(total)}
                    <span className="ml-1.5 text-sm font-medium" style={{ color: 'var(--subtle)' }}>USDC</span>
                  </p>
                  <div className="mt-4 flex items-center justify-between border-t pt-3 text-xs" style={{ borderColor: 'var(--border)' }}>
                    <span style={{ color: 'var(--subtle)' }}>Milestones</span>
                    <span className="font-semibold tabular-nums" style={{ color: 'var(--ink-2)' }}>{milestones.length}</span>
                  </div>
                </div>

                <div className="mt-6 space-y-5">
                  <div className="flow-step">
                    <span className="flow-step__index">01</span>
                    <p className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Create on-chain</p>
                    <p className="mt-1 text-[11px] leading-relaxed" style={{ color: 'var(--subtle)' }}>Records roles, amounts, deadlines, and evidence rules.</p>
                  </div>
                  <div className="flow-step">
                    <span className="flow-step__index">02</span>
                    <p className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Fund separately</p>
                    <p className="mt-1 text-[11px] leading-relaxed" style={{ color: 'var(--subtle)' }}>USDC approval and escrow deposit happen after creation.</p>
                  </div>
                  <div className="flow-step">
                    <span className="flow-step__index">03</span>
                    <p className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>Release by milestone</p>
                    <p className="mt-1 text-[11px] leading-relaxed" style={{ color: 'var(--subtle)' }}>Approval and release remain two distinct funder actions.</p>
                  </div>
                </div>

                <div className="mt-6 flex items-start gap-2.5 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
                  <ShieldCheck className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--accent)' }} />
                  <p className="text-[11px] leading-relaxed" style={{ color: 'var(--subtle)' }}>
                    This creates a contract record. It does not transfer USDC until you fund it.
                  </p>
                </div>

                <TxButton
                  label="Create Agreement"
                  onClick={handleCreate}
                  isPending={isPending}
                  isConfirming={isConfirming}
                  className="mt-5 w-full py-3.5 text-sm"
                />

                {validationError && !isPending && !isConfirming && !isSuccess ? (
                  <div className="mt-3 flex items-start gap-2 rounded-xl border px-3.5 py-3"
                    style={{ background: 'var(--danger-bg)', borderColor: 'var(--danger-border)' }}>
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" style={{ color: 'var(--danger)' }} />
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--danger)' }}>{validationError}</p>
                  </div>
                ) : null}

                <TxReceipt hash={hash} isSuccess={isSuccess} error={error} successLabel="Agreement created — opening…" />
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2.5 px-1 text-[10px] leading-relaxed" style={{ color: 'var(--subtle)' }}>
              <CircleDollarSign className="size-3.5 shrink-0" />
              Amounts use Arc Testnet USDC with six-decimal precision.
            </div>
          </aside>
        </div>
      </motion.div>
    </div>
  )
}
