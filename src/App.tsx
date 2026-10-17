import React, { Component } from 'react'
import { useAccount } from 'wagmi'
import { MotionConfig } from 'framer-motion'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Header } from '@/components/Header'
import { DemoModeBanner } from '@/components/DemoModeBanner'
import { Dashboard } from '@/components/Dashboard'
import { CreateAgreement } from '@/components/CreateAgreement'
import { AgreementDetail } from '@/components/AgreementDetail'
import { useRouter } from '@/hooks/useRouter'

// ─── Error boundary ───────────────────────────────────────────────────────────

interface ErrorBoundaryState { hasError: boolean; message: string }
class ErrorBoundary extends Component<
  { onReset: () => void; children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { onReset: () => void; children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, message: '' }
  }
  static getDerivedStateFromError(err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { hasError: true, message }
  }
  componentDidCatch() { /* surfaced in getDerivedStateFromError */ }
  reset() {
    this.setState({ hasError: false, message: '' })
    this.props.onReset()
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center px-4">
          <div className="panel mx-auto max-w-sm p-7 text-center">
            <AlertTriangle className="mx-auto mb-3 size-8" style={{ color: 'var(--warning)' }} />
            <p className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>
              Something went wrong
            </p>
            <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
              {this.state.message || 'An unexpected error occurred.'}
            </p>
            <button
              onClick={() => this.reset()}
              className="mx-auto mt-4 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-white/5"
              style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}
            >
              <RefreshCw className="size-3.5" /> Go back to dashboard
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ─── Not-found page ────────────────────────────────────────────────────────────

function NotFound({ path, onHome }: { path: string; onHome: () => void }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="panel mx-auto max-w-sm p-7 text-center">
        <p className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>
          Page not found
        </p>
        <p className="mt-1 font-mono text-xs" style={{ color: 'var(--muted)' }}>
          {path}
        </p>
        <button
          onClick={onHome}
          className="mx-auto mt-4 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-white/5"
          style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}
        >
          Go to dashboard
        </button>
      </div>
    </div>
  )
}

// ─── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const { isConnected } = useAccount()
  const { route, pushRoute } = useRouter()
  const [demoDismissed, setDemoDismissed] = React.useState(false)

  const showDemo = !isConnected && !demoDismissed

  function goHome() {
    pushRoute({ name: 'dashboard' })
  }

  // Only a different route starts the content transition and resets route state.
  const routeKey =
    route.name === 'detail'
      ? `detail-${route.agreementId}`
      : route.name === 'not-found'
        ? `not-found-${route.path}`
        : route.name

  return (
    <MotionConfig reducedMotion="user">
      <div className="app-background min-h-dvh">
        <Header
          onLogoClick={goHome}
          onCreate={() => pushRoute({ name: 'create' })}
          activeView={route.name}
        />
        <DemoModeBanner visible={showDemo} onDismiss={() => setDemoDismissed(true)} />

        <main>
          <ErrorBoundary onReset={goHome}>
            {/* Immediate replacement: never hide the page or wait for an exit/RPC.
                The shared shell stays mounted; only route content moves. */}
            <div key={routeKey} className="route-content" data-route={routeKey}>
              {route.name === 'dashboard' && (
                <Dashboard
                  onCreateAgreement={() => pushRoute({ name: 'create' })}
                  onOpenAgreement={id => pushRoute({ name: 'detail', agreementId: id })}
                />
              )}
              {route.name === 'create' && (
                <CreateAgreement
                  onBack={() => pushRoute({ name: 'dashboard' })}
                  onCreated={id => pushRoute({ name: 'detail', agreementId: id })}
                />
              )}
              {route.name === 'detail' && (
                <AgreementDetail
                  agreementId={route.agreementId}
                  onBack={() => pushRoute({ name: 'dashboard' })}
                />
              )}
              {route.name === 'not-found' && (
                <NotFound path={route.path} onHome={goHome} />
              )}
            </div>
          </ErrorBoundary>
        </main>
      </div>
    </MotionConfig>
  )
}
