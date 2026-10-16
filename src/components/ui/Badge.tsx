import React from 'react'

type Variant = 'pending' | 'submitted' | 'approved' | 'released' | 'disputed' | 'refunded' | 'active' | 'completed' | 'cancelled' | 'neutral'

const variantStyles: Record<Variant, React.CSSProperties> = {
  pending:   { background: 'rgba(145,170,190,0.07)', color: '#9fb1c0', border: '1px solid rgba(145,170,190,0.18)' },
  submitted: { background: 'rgba(89,132,166,0.10)', color: '#9cbcd2', border: '1px solid rgba(111,153,184,0.24)' },
  approved:  { background: 'rgba(105,210,194,0.08)', color: '#8cddcf', border: '1px solid rgba(105,210,194,0.22)' },
  released:  { background: 'rgba(105,210,194,0.09)', color: '#78d6b6', border: '1px solid rgba(105,210,194,0.24)' },
  disputed:  { background: 'rgba(217,186,114,0.08)', color: '#d9ba72', border: '1px solid rgba(217,186,114,0.24)' },
  refunded:  { background: 'rgba(145,170,190,0.06)', color: '#8fa3b3', border: '1px solid rgba(145,170,190,0.16)' },
  active:    { background: 'rgba(105,210,194,0.08)', color: '#8cddcf', border: '1px solid rgba(105,210,194,0.22)' },
  completed: { background: 'rgba(105,210,194,0.09)', color: '#78d6b6', border: '1px solid rgba(105,210,194,0.24)' },
  cancelled: { background: 'rgba(145,170,190,0.06)', color: '#8fa3b3', border: '1px solid rgba(145,170,190,0.15)' },
  neutral:   { background: 'rgba(145,170,190,0.05)', color: '#8fa3b3', border: '1px solid rgba(145,170,190,0.14)' },
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
