# PactFlow

> Built with Arc Studio - money-powered apps in minutes

Milestone-based escrow funding platform for builders and community grants on Arc Testnet. Community prototype exploring event-driven funding for Rialo. Future Rialo integration is planned but not yet implemented. Not affiliated with or deployed on Rialo.

---

## What This App Does

PactFlow lets a **funder** create a milestone-based escrow agreement with a **builder** and an **arbitrator**:

1. **Create agreement** — funder defines milestones (description, USDC amount, deadline), builder address, arbitrator address
2. **Fund escrow** — funder approves USDC spend and deposits total milestone amount into the contract
3. **Submit evidence** — builder posts a URL per milestone (stored on-chain; never auto-approves)
4. **Approve + release** — funder reviews evidence, approves, then separately releases funds to builder's claimable balance
5. **Dispute** — either party freezes funds; arbitrator resolves within 30 days (auto-refund to funder on timeout)
6. **Withdraw** — builder (or funder on refund) calls `withdraw()` to pull claimable funds

---

## Deployed Contracts

| Contract   | Network      | Address                                      |
|------------|--------------|----------------------------------------------|
| PactFlow   | Arc Testnet  | `0x555a4cb9b7796d692c4a5edeb845effd9c8af470` |

Constructor arg: `allowedToken = 0x3600000000000000000000000000000000000000` (Arc Testnet USDC)

---

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity ^0.8.20 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`.
  - Build: `bun run contracts:build` (`forge build`)
  - Test: `bun run contracts:test` (`forge test`)
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002)
- Token: USDC 6 decimals, `0x3600000000000000000000000000000000000000`
- Toasts: Sonner

---

## Key Files

| Path | Purpose |
|------|---------|
| `src/App.tsx` | View router (dashboard / create / detail) |
| `src/contracts/pactflow.ts` | ABI import, addresses, enums, URL helpers |
| `src/hooks/usePactFlow.ts` | All wagmi read/write hooks for PactFlow + USDC |
| `src/utils/format.ts` | USDC formatting, address shortening, error parsing |
| `src/components/Dashboard.tsx` | Agreement list, global claimable balance |
| `src/components/CreateAgreement.tsx` | Agreement creation form |
| `src/components/AgreementDetail.tsx` | Milestone timeline, fund/approve/release/dispute/withdraw |
| `src/components/ui/TxButton.tsx` | Chain-aware tx button (auto-prompts chain switch) |
| `src/components/ui/TxReceipt.tsx` | Tx hash + explorer link on success/failure |
| `src/components/ui/Badge.tsx` | Status badges for milestones and agreements |
| `src/index.css` | CSS custom properties (dark navy palette) |
| `contracts/PactFlow.sol` | Escrow contract |
| `contracts/test/PactFlow.t.sol` | 79 Foundry unit tests (all pass) |

---

## Contract Security Summary

Audited at **max** severity over 3 rounds (functional + rule-corpus). All findings resolved:
- Fee-on-transfer: strict `balanceBefore/balanceAfter` equality check in `fundAgreement`
- Dispute inactivity lock: 30-day `disputeDeadline` + `escalateExpiredDispute()` fallback
- Roles not distinct: pairwise check at `createAgreement`
- Token not constrained: `immutable allowedToken` set in constructor; verified `code.length > 0`
- Unbounded milestone DoS: `MAX_MILESTONES = 20`; O(1) `pendingCount`/`activeCount` counters
- Pending milestone lock: `claimExpiredMilestone()` lets funder reclaim past-deadline milestones
- Partial cancellation: `cancelAgreement` now allows cancel when `activeCount == 0` (no in-progress milestones)
- Push-payment brick (Arc blocklist): pull-payment model via `pendingWithdrawals` + `withdraw()`
- Pre-funding griefing: `submitEvidence` and `raiseDispute` require `isFunded == true`

---

## To Run Locally

```bash
bun install
bun run dev
```

---

## Demo Mode

Unauthenticated visitors see a **Demo Mode** banner. All on-chain data (agreements, milestones) is read from Arc Testnet without a wallet. Simulated data is never shown alongside or mixed with on-chain balances.
