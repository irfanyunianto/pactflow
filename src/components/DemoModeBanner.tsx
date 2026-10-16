import React from 'react'
import { Info, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface DemoModeBannerProps { visible: boolean; onDismiss: () => void }

export function DemoModeBanner({ visible, onDismiss }: DemoModeBannerProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className="border-b"
          style={{
            background: 'var(--paper-warm)',
            borderColor: 'var(--border)',
          }}
        >
          <div className="mx-auto flex w-full max-w-[1180px] items-center gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full border"
              style={{ background: 'var(--accent-glow)', borderColor: 'rgba(93,74,184,0.2)' }}>
              <Info className="size-3" style={{ color: 'var(--accent)' }} />
            </span>
            <p className="flex-1 text-[11px] leading-relaxed text-pretty sm:text-xs" style={{ color: 'var(--muted)' }}>
              <strong className="font-semibold" style={{ color: 'var(--ink-2)' }}>Read-only mode.</strong>
              {' '}Live Arc Testnet data is visible without a wallet; no simulated balances are mixed in. Connect to create or transact.
            </p>
            <button
              onClick={onDismiss}
              className="shrink-0 rounded-md p-1.5 hover:bg-white/5"
              style={{ color: 'var(--subtle)' }}
              aria-label="Dismiss read-only mode notice"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
