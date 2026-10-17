import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'

export function CopyAddressButton({ value, label = 'Copy address' }: { value: string; label?: string }) {
  return <CopyButton key={value} value={value} label={label} />
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const lifecycle = useRef({ generation: 0, timer: undefined as ReturnType<typeof setTimeout> | undefined })

  useEffect(() => {
    const state = lifecycle.current
    return () => {
      state.generation++
      clearTimeout(state.timer)
    }
  }, [])

  async function handleCopy() {
    const state = lifecycle.current
    const request = ++state.generation
    clearTimeout(state.timer)
    setCopied(false)
    try {
      await navigator.clipboard.writeText(value)
      if (request !== state.generation) return
      setCopied(true)
      state.timer = setTimeout(() => setCopied(false), 1800)
    } catch {
      if (request === state.generation) toast.error('Could not copy address. Please try again.')
    }
  }

  return (
    <button
      type="button"
      onClick={() => { void handleCopy() }}
      className="copy-address"
      data-copied={copied}
      aria-label={copied ? 'Address copied' : label}
      title={label}
    >
      <span className="copy-address__icons" aria-hidden="true">
        <Copy className="copy-address__copy size-3.5" />
        <Check className="copy-address__check size-3.5" />
      </span>
      <span className="copy-address__feedback" role="status">{copied ? 'Copied' : ''}</span>
    </button>
  )
}
