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
          className="flex items-center gap-3 border-b px-4 py-2 sm:px-6"
          style={{
            background: 'rgba(26,95,168,0.12)',
            borderColor: 'rgba(172,198,233,0.18)',
          }}
        >
          <Info className="size-3.5 shrink-0" style={{ color: 'var(--accent)' }} />
          <p className="flex-1 text-xs text-pretty" style={{ color: 'var(--muted)' }}>
            <strong className="font-semibold" style={{ color: 'var(--ink-2)' }}>Demo Mode</strong>
            {' '}— Browsing PactFlow without a wallet. On-chain data is live from Arc Testnet. Simulated balances are never shown.
            Connect a wallet to create agreements and send transactions.
          </p>
          <button
            onClick={onDismiss}
            className="shrink-0 rounded-md p-1 transition-colors hover:bg-white/10"
            style={{ color: 'var(--muted)' }}
            aria-label="Dismiss"
          >
            <X className="size-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
