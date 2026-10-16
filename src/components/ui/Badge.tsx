import React from 'react'

type Variant = 'pending' | 'submitted' | 'approved' | 'released' | 'disputed' | 'refunded' | 'active' | 'completed' | 'cancelled' | 'neutral'

const variantStyles: Record<Variant, React.CSSProperties> = {
  pending:   { background: 'rgba(168,187,212,0.10)', color: '#b8ccdf', border: '1px solid rgba(168,187,212,0.22)' },
  submitted: { background: 'rgba(107,141,181,0.15)', color: '#b4cde8', border: '1px solid rgba(107,141,181,0.3)'  },
  approved:  { background: 'rgba(172,198,233,0.15)', color: '#c2d8f0', border: '1px solid rgba(172,198,233,0.35)' },
  released:  { background: 'rgba(141,216,159,0.12)', color: '#8dd89f', border: '1px solid rgba(141,216,159,0.28)' },
  disputed:  { background: 'rgba(240,201,106,0.12)', color: '#f0c96a', border: '1px solid rgba(240,201,106,0.28)' },
  refunded:  { background: 'rgba(168,187,212,0.08)', color: '#a8bbd4', border: '1px solid rgba(168,187,212,0.18)' },
  active:    { background: 'rgba(172,198,233,0.13)', color: '#c2d8f0', border: '1px solid rgba(172,198,233,0.3)'  },
  completed: { background: 'rgba(141,216,159,0.12)', color: '#8dd89f', border: '1px solid rgba(141,216,159,0.28)' },
  cancelled: { background: 'rgba(168,187,212,0.08)', color: '#a8bbd4', border: '1px solid rgba(168,187,212,0.16)' },
  neutral:   { background: 'rgba(168,187,212,0.07)', color: '#a8bbd4', border: '1px solid rgba(168,187,212,0.14)' },
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
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ${className}`}
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
