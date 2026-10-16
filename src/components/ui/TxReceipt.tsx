import React from 'react'
import { CheckCircle2, ExternalLink, XCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { buildTxUrl } from '@/contracts/pactflow'
import { parseOnchainError } from '@/utils/format'

interface TxReceiptProps {
  hash: `0x${string}` | undefined
  isSuccess: boolean
  error: unknown
  successLabel?: string
}

export function TxReceipt({ hash, isSuccess, error, successLabel = 'Transaction confirmed' }: TxReceiptProps) {
  const visible = (isSuccess && !!hash) || !!error

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
        >
          {isSuccess && hash ? (
            <div className="mt-3 flex items-start gap-2.5 rounded-xl border p-3.5"
              style={{ background: 'var(--success-bg)', borderColor: 'var(--success-border)' }}>
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--success)' }} />
              <div className="min-w-0">
                <p className="text-sm font-semibold" style={{ color: 'var(--success)' }}>{successLabel}</p>
                <a
                  href={buildTxUrl(hash)}
                  target="_blank" rel="noreferrer"
                  className="mt-0.5 inline-flex items-center gap-1 text-xs hover:underline"
                  style={{ color: 'rgba(105,210,194,0.72)' }}
                >
                  View on ArcScan <ExternalLink className="size-3" />
                </a>
              </div>
            </div>
          ) : error ? (
            <div className="mt-3 flex items-start gap-2.5 rounded-xl border p-3.5"
              style={{ background: 'var(--danger-bg)', borderColor: 'var(--danger-border)' }}>
              <XCircle className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--danger)' }} />
              <p className="text-sm" style={{ color: 'var(--danger)' }}>{parseOnchainError(error)}</p>
            </div>
          ) : null}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
