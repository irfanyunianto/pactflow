import React from 'react'
import { ConnectKitButton } from 'connectkit'
import { motion } from 'framer-motion'
import { Layers } from 'lucide-react'

interface HeaderProps { onLogoClick: () => void }

export function Header({ onLogoClick }: HeaderProps) {
  return (
    <header
      className="sticky top-0 z-40 flex items-center justify-between border-b px-4 py-3 sm:px-6"
      style={{
        background: 'rgba(13,27,47,0.88)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Logo */}
      <motion.button
        onClick={onLogoClick}
        className="group flex items-center gap-2.5"
        whileTap={{ scale: 0.96 }}
      >
        <div
          className="flex size-8 items-center justify-center rounded-xl transition-transform group-hover:scale-105"
          style={{ background: 'linear-gradient(135deg, #1a5fa8 0%, var(--accent) 100%)' }}
        >
          <Layers className="size-4 text-white" />
        </div>
        <div>
          <span className="display block text-sm font-bold leading-tight" style={{ color: 'var(--ink)' }}>
            PactFlow
          </span>
          <span className="block text-[9px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'var(--subtle)' }}>
            Milestone Funding
          </span>
        </div>
      </motion.button>

      {/* Right */}
      <div className="flex items-center gap-2.5">
        <span
          className="hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider sm:inline-flex"
          style={{ borderColor: 'var(--border)', color: 'var(--subtle)', background: 'var(--surface-muted)' }}
        >
          <span className="size-1.5 rounded-full" style={{ background: '#8dd89f' }} />
          Arc Testnet
        </span>
        <ConnectKitButton
          customTheme={{
            '--ck-font-family': "'DM Sans', sans-serif",
            '--ck-primary-button-background': 'var(--accent)',
            '--ck-primary-button-color': '#0d1b2f',
            '--ck-primary-button-hover-background': 'var(--accent-hover)',
            '--ck-body-background': '#0f1e32',
            '--ck-body-color': 'var(--ink)',
            '--ck-border-radius': '14px',
            '--ck-overlay-background': 'rgba(0,0,0,0.7)',
          }}
        />
      </div>
    </header>
  )
}
