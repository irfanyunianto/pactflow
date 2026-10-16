import React from 'react'

type Variant = 'pending' | 'submitted' | 'approved' | 'released' | 'disputed' | 'refunded' | 'active' | 'completed' | 'cancelled' | 'neutral'

const variantStyles: Record<Variant, React.CSSProperties> = {
  pending:   { background: '#302b36', color: '#c5bbd0', border: '1px solid rgba(55,49,72,0.16)' },
  submitted: { background: '#322c42', color: '#c8b4ed', border: '1px solid rgba(83,71,150,0.22)' },
  approved:  { background: '#372b47', color: '#d1b4f6', border: '1px solid rgba(101,72,166,0.22)' },
  released:  { background: '#23372c', color: '#a1d3b5', border: '1px solid rgba(40,117,84,0.23)' },
  disputed:  { background: '#3e2f25', color: '#edbd95', border: '1px solid rgba(152,75,36,0.24)' },
  refunded:  { background: '#302b36', color: '#c5bbd0', border: '1px solid rgba(62,57,72,0.16)' },
  active:    { background: '#322c42', color: '#c8b4ed', border: '1px solid rgba(81,65,157,0.22)' },
  completed: { background: '#23372c', color: '#a1d3b5', border: '1px solid rgba(40,117,84,0.23)' },
  cancelled: { background: '#302b36', color: '#c5bbd0', border: '1px solid rgba(62,57,72,0.16)' },
  neutral:   { background: '#302b36', color: '#c5bbd0', border: '1px solid rgba(62,57,72,0.14)' },
}

interface BadgeProps {
  variant: Variant
  children: React.ReactNode
  className?: string
}

export function Badge({ variant, children, className = '' }: BadgeProps) {
  return (
    <span
      style={variantStyles[variant]}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.11em] ${className}`}
    >
      {children}
    </span>
  )
}

export function milestoneStatusBadge(status: number) {
  const map: Record<number, { variant: Variant; label: string }> = {
    0: { variant: 'pending',   label: 'Pending' },
    1: { variant: 'submitted', label: 'Submitted' },
    2: { variant: 'approved',  label: 'Approved' },
    3: { variant: 'released',  label: 'Released' },
    4: { variant: 'disputed',  label: 'Disputed' },
    5: { variant: 'refunded',  label: 'Refunded' },
  }
  const entry = map[status] ?? { variant: 'neutral', label: 'Unknown' }
  return <Badge variant={entry.variant}>{entry.label}</Badge>
}

export function agreementStatusBadge(status: number) {
  const map: Record<number, { variant: Variant; label: string }> = {
    0: { variant: 'active',    label: 'Active' },
    1: { variant: 'completed', label: 'Completed' },
    2: { variant: 'cancelled', label: 'Cancelled' },
  }
  const entry = map[status] ?? { variant: 'neutral', label: 'Unknown' }
  return <Badge variant={entry.variant}>{entry.label}</Badge>
}
