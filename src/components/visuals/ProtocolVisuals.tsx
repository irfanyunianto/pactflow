import React from 'react'

interface BrandMarkProps {
  className?: string
  monochrome?: boolean
}

/** Two interlocking ribbons: the agreement and its controlled fund flow. */
export function BrandMark({ className = '', monochrome = false }: BrandMarkProps) {
  return (
    <span className={`brand-mark ${className}`} aria-hidden="true">
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M18 54V20.5C18 12.492 24.492 6 32.5 6H40c9.941 0 18 8.059 18 18s-8.059 18-18 18H29"
          className="brand-mark__agreement"
          strokeWidth="7.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M7 43V27.5C7 19.492 13.492 13 21.5 13H38c7.18 0 13 5.82 13 13s-5.82 13-13 13H28c-6.075 0-11 4.925-11 11v4"
          className={monochrome ? 'brand-mark__agreement' : 'brand-mark__flow'}
          strokeWidth="7.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

export function EscrowFlowVisual() {
  return (
    <div
      className="flow-demo"
      role="img"
      aria-label="Illustrative protocol sequence: the funder deposits USDC into escrow, a milestone is reviewed through separate approve and release decisions, funds stay in escrow until the separate release transaction makes a balance claimable for the builder. Withdrawal is another separate transaction. This is an explanation, not live transaction status."
    >
      <div className="flow-demo__header">
        <span>Agreement map</span>
        <span className="flow-demo__mode"><i /> Illustrative · not live</span>
      </div>

      <svg viewBox="0 0 680 368" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <marker id="flowArrow" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">
            <path d="M0 0 7 3.5 0 7" fill="none" stroke="currentColor" strokeWidth="1.4" />
          </marker>
        </defs>

        <path className="flow-demo__guide" d="M136 180H218M310 180h74M490 180h74" />
        <path className="flow-demo__arrow flow-demo__arrow--1" d="M136 180H218" markerEnd="url(#flowArrow)" />
        <path className="flow-demo__arrow flow-demo__arrow--2" d="M310 180h74" markerEnd="url(#flowArrow)" />
        <path className="flow-demo__arrow flow-demo__arrow--3" d="M490 180h74" markerEnd="url(#flowArrow)" />

        <g className="flow-demo__node flow-demo__node--1">
          <rect x="24" y="128" width="112" height="104" rx="6" />
          <rect className="flow-demo__highlight flow-demo__phase--fund" x="24" y="128" width="112" height="104" rx="6" />
          <text className="flow-demo__index" x="40" y="151">01</text>
          <circle cx="80" cy="176" r="15" />
          <path d="M73 176h14M80 169v14" />
          <text className="flow-demo__label" x="80" y="211" textAnchor="middle">FUNDER</text>
          <text className="flow-demo__meta" x="80" y="247" textAnchor="middle">deposit USDC</text>
        </g>

        <g className="flow-demo__node flow-demo__node--2">
          <rect x="218" y="108" width="92" height="144" rx="46" />
          <rect className="flow-demo__highlight flow-demo__phase--hold" x="218" y="108" width="92" height="144" rx="46" />
          <path d="M242 198v-43a22 22 0 0 1 22-22h8a22 22 0 0 1 0 44h-15" />
          <path className="flow-demo__violet" d="M235 190v-27a17 17 0 0 1 17-17h18a16 16 0 0 1 0 32h-11a15 15 0 0 0-15 15v8" />
          <text className="flow-demo__held" x="264" y="85" textAnchor="middle">USDC HELD</text>
          <text className="flow-demo__label" x="264" y="226" textAnchor="middle">ESCROW</text>
          <text className="flow-demo__meta" x="264" y="268" textAnchor="middle">contract holds USDC</text>
        </g>

        <g className="flow-demo__node flow-demo__node--3">
          <rect x="384" y="88" width="106" height="184" rx="6" />
          <text className="flow-demo__index" x="400" y="111">03 / 04</text>
          <text className="flow-demo__label" x="400" y="142">REVIEW</text>
          <rect className="flow-demo__review" x="400" y="158" width="74" height="32" rx="4" />
          <rect className="flow-demo__highlight flow-demo__phase--approve" x="400" y="158" width="74" height="32" rx="4" />
          <text className="flow-demo__review-text" x="411" y="178">APPROVE</text>
          <rect className="flow-demo__review" x="400" y="198" width="74" height="32" rx="4" />
          <rect className="flow-demo__highlight flow-demo__phase--release" x="400" y="198" width="74" height="32" rx="4" />
          <text className="flow-demo__review-text" x="411" y="218">RELEASE</text>
          <path className="flow-demo__decision flow-demo__decision--approve" d="M459 169l4 4 7-9" />
          <path className="flow-demo__decision flow-demo__decision--release" d="M459 209l4 4 7-9" />
          <text className="flow-demo__meta" x="437" y="289" textAnchor="middle">two separate funder actions</text>
        </g>

        <g className="flow-demo__node flow-demo__node--4">
          <rect x="564" y="128" width="92" height="104" rx="6" />
          <rect className="flow-demo__highlight flow-demo__phase--claim" x="564" y="128" width="92" height="104" rx="6" />
          <text className="flow-demo__index" x="580" y="151">05</text>
          <path d="M583 168h52v30h-52zM595 168v-8h28v8M594 185h30" />
          <circle cx="626" cy="185" r="2" />
          <text className="flow-demo__claimable" x="610" y="105" textAnchor="middle">CLAIMABLE</text>
          <text className="flow-demo__label" x="610" y="215" textAnchor="middle">BUILDER</text>
          <text className="flow-demo__meta" x="610" y="247" textAnchor="middle">claimable balance</text>
        </g>

        {/* One shared CSS clock keeps funds, decisions, and highlights in order. */}
        <circle className="flow-demo__transfer flow-demo__transfer--deposit" cx="136" cy="180" r="4.5" />
        <circle className="flow-demo__transfer flow-demo__transfer--release" cx="310" cy="180" r="4.5" />
        <circle className="flow-demo__transfer flow-demo__transfer--claim" cx="490" cy="180" r="4.5" />

        <g className="flow-demo__note">
          <path d="M24 324h632" />
          <text x="24" y="346">EVIDENCE NEVER AUTO-APPROVES</text>
          <text x="656" y="346" textAnchor="end">WALLET CONFIRMATION DEFINES REAL STATUS</text>
        </g>
      </svg>

      <ol className="flow-demo__stages" aria-hidden="true">
        {[
          ['fund', 'Fund escrow', 'USDC moves from the funder into escrow.'],
          ['hold', 'Funds held', 'Escrow holds USDC while evidence is reviewed.'],
          ['approve', 'Approve', 'The funder approves the milestone. Funds stay in escrow.'],
          ['release', 'Release', 'A separate funder transaction makes funds claimable.'],
          ['claim', 'Claimable', 'The builder can withdraw in a separate transaction.'],
        ].map(([phase, title, description], index) => (
          <li key={phase} className={`flow-demo__phase--${phase}`}>
            <b>{String(index + 1).padStart(2, '0')}</b>
            <div><strong>{title}</strong><small>{description}</small></div>
          </li>
        ))}
      </ol>

      <div className="flow-demo__caption">
        <span>Protocol walkthrough</span>
        <p>Funds become claimable only after review, approval, and a separate release transaction.</p>
      </div>
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

/** Displays the observed on-chain status; never advances itself on a timer. */
export function MilestoneRail({ status }: { status: number }) {
  const labels = ['Pending', 'Evidence', 'Approved', 'Released']
  if (status < 0 || status > 3) return null
  return (
    <div className="milestone-rail" aria-label={`Milestone stage: ${labels[status]}`}>
      {labels.map((label, index) => (
        <span key={label} data-current={index === status} aria-current={index === status ? 'step' : undefined}>
          <i key={`${label}-${status}`} />{label}
        </span>
      ))}
    </div>
  )
}
