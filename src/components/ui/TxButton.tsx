import React from 'react'
import { Loader2 } from 'lucide-react'
import { useAccount, useSwitchChain } from 'wagmi'
import { ARC_TESTNET_CHAIN_ID } from '@/contracts/pactflow'

interface TxButtonProps {
  label: string
  loadingLabel?: string
  confirmingLabel?: string
  onClick: () => void
  isPending: boolean
  isConfirming: boolean
  disabled?: boolean
  variant?: 'primary' | 'danger' | 'ghost'
  className?: string
}

export function TxButton({
  label,
  loadingLabel   = 'Confirm in wallet…',
  confirmingLabel = 'Confirming…',
  onClick,
  isPending,
  isConfirming,
  disabled = false,
  variant = 'primary',
  className = '',
}: TxButtonProps) {
  const { isConnected, chainId } = useAccount()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const wrongChain = isConnected && chainId !== ARC_TESTNET_CHAIN_ID

  const base = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-bold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2'

  const styles: Record<string, React.CSSProperties> = {
    primary: {
      background: 'var(--accent)',
      border: '1px solid var(--accent)',
      color: '#fffdf8',
      boxShadow: '0 8px 20px rgba(73,57,149,0.14)',
    },
    danger: {
      background: 'var(--danger-bg)',
      border: '1px solid var(--danger-border)',
      color: 'var(--danger)',
    },
    ghost: {
      background: 'var(--paper)',
      border: '1px solid var(--border)',
      color: 'var(--ink-2)',
    },
  }

  const hoverStyles: Record<string, string> = {
    primary: 'hover:brightness-105 hover:-translate-y-px',
    danger:  'hover:brightness-110',
    ghost:   'hover:bg-black/5',
  }

  if (!isConnected) {
    return (
      <button
        disabled
        className={`${base} ${hoverStyles[variant]} ${className}`}
        style={styles[variant]}
      >
        Connect Wallet
      </button>
    )
  }

  if (wrongChain) {
    return (
      <button
        onClick={() => switchChain({ chainId: ARC_TESTNET_CHAIN_ID })}
        disabled={isSwitching}
        className={`${base} ${className}`}
        style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', color: 'var(--warning)' }}
      >
        {isSwitching
          ? <><Loader2 className="size-4 animate-spin" /> Switching…</>
          : 'Switch to Arc Testnet'}
      </button>
    )
  }

  const busy = isPending || isConfirming

  return (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      className={`${base} ${hoverStyles[variant]} ${className}`}
      style={styles[variant]}
    >
      {isPending    ? <><Loader2 className="size-4 animate-spin" /> {loadingLabel}</>    :
       isConfirming ? <><Loader2 className="size-4 animate-spin" /> {confirmingLabel}</> :
       label}
    </button>
  )
}
