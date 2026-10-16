# PactFlow

**Milestone-based escrow on Arc Testnet.**

PactFlow is a community prototype that lets a funder create milestone agreements with a builder and an arbitrator, lock USDC in a smart contract, and release funds only after work is reviewed and approved.

> Built with [Arc Studio](https://studio.arc.io). Community prototype — not affiliated with Rialo. Not audited. Testnet only.

---

## How it works

| Role | Responsibilities |
|------|-----------------|
| **Funder** | Creates the agreement, deposits USDC, approves milestones, can cancel |
| **Builder** | Submits evidence URLs per milestone |
| **Arbitrator** | Resolves disputes within 30 days (funds auto-refund to funder on timeout) |

All three roles must be distinct addresses. Funds sit in the contract until explicitly released. Both funder and builder must call `withdraw()` to pull claimable balances into their wallets.

---

## Deployed contract

| Contract | Network | Address |
|----------|---------|---------|
| PactFlow | Arc Testnet (Chain ID 5042002) | [`0x555a4cb9b7796d692c4a5edeb845effd9c8af470`](https://explorer.testnet.arc.io/address/0x555a4cb9b7796d692c4a5edeb845effd9c8af470) |

Escrow token: Arc Testnet USDC `0x3600000000000000000000000000000000000000` (6 decimals).

The contract is deployed and existing agreements are live. Do not redeploy unless you intend to start fresh — any existing agreements would be on the old address.

---

## Requirements

- [Bun](https://bun.sh) ≥ 1.1 (used as package manager and test runner)
- [Foundry](https://book.getfoundry.sh) (for contract builds and tests only; not needed to run the frontend)
- A browser wallet: MetaMask or any EIP-1193 injected wallet connected to **Arc Testnet** (Chain ID 5042002, RPC `https://rpc.testnet.arc.io`)
- Arc Testnet USDC to interact with the contract (get some at [faucet.circle.com](https://faucet.circle.com) or the Arc testnet faucet)

---

## Environment variables

No secret environment variables are required to run this app. See `.env.example` for documentation.

The app connects directly to the public Arc Testnet RPC (`https://rpc.testnet.arc.io`) via wagmi's default `http()` transport. No API keys are needed.

---

## Install and run locally

```sh
# 1. Install dependencies
bun install

# 2. Start the dev server
bun run dev
# → http://localhost:5173
```

---

## Run tests

```sh
# Frontend unit tests (bun test)
bun test

# Lint and typecheck
bun run check

# Contract tests (requires Foundry)
bun run contracts:test
```

---

## Production build

```sh
bun run build          # outputs to dist/
# Serve the dist/ folder with any static host
```

The output is a fully static SPA. Serve `dist/` from any CDN or static host. All wallet and RPC calls happen client-side; there is no backend or API server.

---

## Hosting

### Netlify

```sh
# Build command:  bun run build
# Publish dir:    dist
# No environment variables required
```

For client-side routing, add a `_redirects` file inside `dist/`:
```
/*  /index.html  200
```

Or add a `netlify.toml`:
```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### Vercel

```sh
# Framework:       Vite
# Build command:   bun run build
# Output dir:      dist
# No environment variables required
```

### Hugging Face Spaces

Use a Docker Space. Ensure `package.json` has a `"start"` script or use the Dockerfile approach.

### GitHub Pages

Set the Vite `base` option in `vite.config.ts` to your repo path (e.g. `/pactflow/`), build, and push `dist/` to the `gh-pages` branch.

---

## Key source files

| Path | Purpose |
|------|---------|
| `src/App.tsx` | View router (dashboard / create / detail) |
| `src/components/Dashboard.tsx` | Agreement list, stats, claimable balance |
| `src/components/AgreementDetail.tsx` | Milestone lifecycle, all tx flows, sync |
| `src/components/CreateAgreement.tsx` | Agreement creation form |
| `src/contracts/pactflow.ts` | ABI, contract address, enums, explorer URLs |
| `src/hooks/usePactFlow.ts` | All wagmi read/write hooks + sync utilities |
| `src/utils/retryRefetch.ts` | Bounded retry loop with postcondition checking |
| `src/utils/milestonePostconditions.ts` | Action-specific postconditions for sync verification |
| `src/utils/parseUSDC.ts` | Float-free USDC decimal parser |
| `src/utils/validateAgreement.ts` | Shared form + action eligibility validation |
| `src/utils/dashboardAggregation.ts` | Pure stats aggregation (used by Dashboard + tests) |
| `contracts/PactFlow.sol` | Solidity contract source |
| `contracts/test/PactFlow.t.sol` | 79 Foundry unit tests |
| `src/utils/__tests__/` | Frontend regression tests (125 tests, bun test) |

---

## Contract interaction limits

These limits come from the **contract itself** (reverts on violation):
- Maximum 20 milestones per agreement (`MAX_MILESTONES = 20`)
- Milestone amount must be > 0
- Milestone deadline must be > 0 (any nonzero Unix timestamp)
- Funder, Builder, and Arbitrator must be distinct addresses

These limits are **frontend policy only** (the contract has no such check):
- Description length capped at 256 characters in the form
- Amount capped at 1,000,000 USDC in the form
- Deadline must be in the future (contract only requires it to be non-zero)

---

## Known limitations

- `claimExpiredMilestone` is implemented: funder can reclaim funds from a milestone whose deadline passed and for which the builder never submitted evidence.
- No ENS display for arbitrator addresses on Arc Testnet (ENS resolution uses Ethereum mainnet).
- The app uses injected wallets only (MetaMask, etc.). WalletConnect is not configured — add a `VITE_WALLETCONNECT_PROJECT_ID` and update `src/config.ts` if needed.
- Chunk size warning at build time (wagmi/ConnectKit bundle ~1.5MB). Normal for a wagmi app; use dynamic imports or code-splitting if bundle size is a concern.

---

## Running outside Arc Studio

This app was built in [Arc Studio](https://studio.arc.io). Two instrumentation files (`src/tracing.ts`, `src/console-capture.ts`) use `window.parent.postMessage` to send trace and console data to the Studio preview panel. Outside Studio:
- These files detect `window !== window.parent` — if the app is running as a top-level page (not in an iframe), the postMessage calls are skipped entirely.
- All app functionality is unaffected. The instrumentation patches `console.*` as a side-effect but always preserves the original behaviour.

---

## License

MIT. Community prototype. Not audited. Use on testnet only.
