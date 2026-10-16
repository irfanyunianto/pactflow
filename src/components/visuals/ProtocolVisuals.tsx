import React from 'react'

interface BrandMarkProps {
  className?: string
}

export function BrandMark({ className = '' }: BrandMarkProps) {
  return (
    <span className={`brand-mark ${className}`} aria-hidden="true">
      <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 4 34 12v16l-14 8-14-8V12l14-8Z" stroke="currentColor" strokeWidth="1.4" />
        <path d="m10 14 10 5.8L30 14M10 25.8 20 20l10 5.8" stroke="currentColor" strokeWidth="1.4" />
        <path d="M20 9.4v21.2" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="20" cy="20" r="3.4" fill="currentColor" />
      </svg>
    </span>
  )
}

export function EscrowFlowVisual() {
  return (
    <div className="escrow-visual" aria-hidden="true">
      <div className="escrow-visual__halo" />
      <svg viewBox="0 0 560 360" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="flowLine" x1="80" y1="180" x2="480" y2="180" gradientUnits="userSpaceOnUse">
            <stop stopColor="#395878" />
            <stop offset="0.5" stopColor="#69D2C2" />
            <stop offset="1" stopColor="#395878" />
          </linearGradient>
          <linearGradient id="vaultFace" x1="218" y1="120" x2="342" y2="244" gradientUnits="userSpaceOnUse">
            <stop stopColor="#17304A" />
            <stop offset="1" stopColor="#0A1726" />
          </linearGradient>
          <filter id="tealGlow" x="170" y="70" width="220" height="220" filterUnits="userSpaceOnUse">
            <feGaussianBlur stdDeviation="18" />
          </filter>
        </defs>

        <path d="M92 180H206M354 180h114" stroke="url(#flowLine)" strokeWidth="1.5" strokeDasharray="5 7" />
        <path d="m194 174 12 6-12 6M456 174l12 6-12 6" stroke="#69D2C2" strokeWidth="1.5" />

        <g opacity=".42" stroke="#5B7898">
          <ellipse cx="280" cy="180" rx="190" ry="122" />
          <ellipse cx="280" cy="180" rx="226" ry="154" strokeDasharray="2 9" />
        </g>

        <circle cx="280" cy="180" r="82" fill="#47C7B1" opacity=".08" filter="url(#tealGlow)" />

        <g>
          <rect x="214" y="114" width="132" height="132" rx="30" fill="url(#vaultFace)" stroke="#6F8CAA" strokeWidth="1.4" />
          <rect x="226" y="126" width="108" height="108" rx="23" stroke="#274761" />
          <circle cx="280" cy="180" r="31" fill="#0B1928" stroke="#69D2C2" strokeWidth="1.4" />
          <circle cx="280" cy="180" r="18" stroke="#365F70" />
          <path d="M280 162v8m0 20v8m-18-18h8m20 0h8" stroke="#69D2C2" strokeWidth="1.5" />
          <circle cx="280" cy="180" r="4" fill="#C6FFF5" />
        </g>

        <g>
          <rect x="46" y="145" width="92" height="70" rx="18" fill="#0C1B2B" stroke="#34536F" />
          <path d="M76 179h32m-25-12h18m-18 24h18" stroke="#AFC1D3" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="92" cy="180" r="27" stroke="#233D55" />
          <text x="92" y="239" fill="#7F98AF" fontSize="10" textAnchor="middle" letterSpacing="2">FUNDER</text>
        </g>

        <g>
          <rect x="422" y="145" width="92" height="70" rx="18" fill="#0C1B2B" stroke="#34536F" />
          <path d="m449 184 12 10 25-28" stroke="#69D2C2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <text x="468" y="239" fill="#7F98AF" fontSize="10" textAnchor="middle" letterSpacing="2">BUILDER</text>
        </g>

        <g>
          <circle cx="280" cy="43" r="5" fill="#69D2C2" />
          <circle cx="280" cy="43" r="12" stroke="#69D2C2" opacity=".32" />
          <path d="M280 55v39" stroke="#365A73" strokeDasharray="3 5" />
          <text x="280" y="22" fill="#7F98AF" fontSize="10" textAnchor="middle" letterSpacing="2">ARBITRATION</text>
        </g>

        <g fill="#07111D" stroke="#4B6A85">
          <circle cx="170" cy="86" r="7" />
          <circle cx="390" cy="274" r="7" />
          <circle cx="166" cy="280" r="5" />
        </g>
      </svg>

      <div className="escrow-visual__status">
        <span /> Contract secured
      </div>
      <div className="escrow-visual__caption">Funds move only when a milestone is approved and released.</div>
    </div>
  )
}

interface ResolutionDialProps {
  progress: number
  label?: string
}

export function ResolutionDial({ progress, label = 'resolved' }: ResolutionDialProps) {
  const safeProgress = Math.max(0, Math.min(100, progress))
  return (
    <div className="resolution-dial" role="img" aria-label={`${safeProgress}% ${label}`}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle className="resolution-dial__track" cx="60" cy="60" r="47" />
        <circle
          className="resolution-dial__value"
          cx="60"
          cy="60"
          r="47"
          pathLength="100"
          strokeDasharray={`${safeProgress} ${100 - safeProgress}`}
        />
      </svg>
      <span className="resolution-dial__number">{safeProgress}%</span>
      <span className="resolution-dial__label">{label}</span>
    </div>
  )
}
