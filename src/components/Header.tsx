import React from 'react'
import { ConnectKitButton } from 'connectkit'
import { ChevronDown, LayoutGrid, Plus, Wallet } from 'lucide-react'
import { BrandMark } from '@/components/visuals/ProtocolVisuals'

interface HeaderProps {
  onLogoClick: () => void
  onCreate: () => void
  activeView: 'dashboard' | 'create' | 'detail' | 'not-found'
}

export function Header({ onLogoClick, onCreate, activeView }: HeaderProps) {
  return (
    <header
      className="sticky top-0 z-40 border-b"
      style={{
        background: 'var(--header-bg)',
        borderColor: 'var(--border)',
      }}
    >
      <div className="app-container flex h-[68px] items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-5">
          <button
            onClick={onLogoClick}
            className="group flex shrink-0 items-center gap-2.5"
            aria-label="PactFlow dashboard"
          >
            <BrandMark />
            <div className="text-left">
              <span className="display block text-[15px] font-bold leading-tight" style={{ color: 'var(--ink)' }}>
                PactFlow
              </span>
              <span className="hidden text-[8px] font-bold min-[380px]:block uppercase tracking-[0.18em]" style={{ color: 'var(--subtle)' }}>
                Milestone workspace
              </span>
            </div>
          </button>

          <nav className="hidden items-center gap-1 border-l pl-5 sm:flex" style={{ borderColor: 'var(--border)' }} aria-label="Primary navigation">
            <button className="nav-link" data-active={activeView === 'dashboard'} onClick={onLogoClick}>
              <LayoutGrid className="size-3.5" /> Overview
            </button>
            <button className="nav-link" data-active={activeView === 'create'} onClick={onCreate}>
              <Plus className="size-3.5" /> New agreement
            </button>
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
          <span className="network-pill hidden md:inline-flex">
            <span className="network-pill__dot" />
            Arc Testnet
          </span>
          <button
            className="flex size-9 items-center justify-center rounded-xl border sm:hidden"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--accent)' }}
            onClick={onCreate}
            aria-label="Create agreement"
          >
            <Plus className="size-4" />
          </button>
          <ConnectKitButton.Custom>
            {({ isConnected, isConnecting, show, truncatedAddress, ensName }) => (
              <button
                onClick={() => show?.()}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-bold sm:px-4"
                style={{
                  borderColor: isConnected ? 'rgba(93,74,184,0.28)' : 'var(--border)',
                  background: isConnected ? 'var(--accent-glow)' : 'var(--paper)',
                  color: isConnected ? 'var(--accent-deep)' : 'var(--ink-2)',
                }}
              >
                <Wallet className="size-3.5" />
                <span className="hidden min-[420px]:inline">
                  {isConnecting ? 'Connecting…' : isConnected ? (ensName ?? truncatedAddress) : 'Connect wallet'}
                </span>
                <span className="min-[420px]:hidden">{isConnected ? 'Wallet' : 'Connect'}</span>
                <ChevronDown className="size-3 opacity-50" />
              </button>
            )}
          </ConnectKitButton.Custom>
        </div>
      </div>
    </header>
  )
}
