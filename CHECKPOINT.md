# Work checkpoint — 2026-10-17

## Current update — hero sequence and agreement scope

Continued from `d591033`. This checkpoint includes the tested hero animation and
My agreements / All agreements dashboard feature. No deployment, wallet signing,
or transaction broadcast was performed.

### Hero

- One shared 16-second CSS cycle illustrates fund escrow → funds held → approve →
  separate release → claimable balance. Moving violet markers follow the transfer
  paths, with stage highlights, readable pauses, and soft transitions.
- Preserved “Illustrative · not live”, charcoal/violet colors, logo geometry, and
  application logic. No React animation timers, new dependencies, flashing, or glow
  filters were introduced.
- Reduced motion presents a static readable diagram without moving markers. The
  mobile walkthrough uses the same five phases; approve and release are separate.
- Chromium recordings and sampled computed styles confirmed real marker movement,
  stage order, and the pause between approve, release, and claimable. Reduced-motion
  desktop/mobile checks passed against the local production preview.

### Dashboard scope

- Connected wallets default to My agreements; disconnected visitors see All
  agreements. Ownership matches the active address against funder, builder, or
  arbitrator without case sensitivity.
- Status filtering intersects with scope. Status-tab counts describe the selected
  scope before the status filter. Summary metrics remain explicitly Global;
  claimable balance is labeled Your Wallet.
- Cards, counts, and empty states require a complete registry read. A failed count
  or agreement read shows an error and Retry instead of a partial list. Retry
  refetches records as well as the count, including failures within a multicall.
- Wallet identity keys reset wallet-specific presentation synchronously on account
  changes/disconnect: selected scope, status filter, old cards, balance, and receipt
  presentation. Public contract-query data remains cached independently of wallets.
- Dashboard cards and filters share a wagmi useReadContracts result. Removed the
  separate hidden loaders and duplicate per-card reads. Transaction hooks, routing,
  contracts, ABI, deployed addresses, RPC configuration, and role gates are unchanged.

### Latest verification

- `npm run lint`: pass, no warnings/errors.
- `npm run typecheck`: pass.
- `bun test`: **170 pass, 0 fail**, 7 files, including ownership/status/completeness
  cases in `src/utils/__tests__/dashboardScope.test.ts`.
- `/home/ubuntu/.foundry/bin/forge test`: **79 pass, 0 fail**, 17 suites.
  The installed Forge binary was used because `npm run contracts:test` could not
  find Forge on the shell PATH.
- `npm run build`: pass, **1m 30s**. Existing dependency annotation notices and
  bundle-size warnings remain unsuppressed.
- Chromium with injected-wallet and ABI-encoded RPC fixtures passed: all three
  roles, mixed-case matching, a new wallet without agreements, wallet switching,
  disconnect, status/scope combinations and counts, loading without premature
  empty states, and individual-record failure followed by successful Retry with
  an unchanged agreement count. No browser page errors. No transactions were sent.
- Latest source changes: `src/components/Dashboard.tsx`,
  `src/components/visuals/ProtocolVisuals.tsx`, `src/index.css`,
  `src/utils/dashboardScope.ts`, and `src/utils/__tests__/dashboardScope.test.ts`.
- Local evidence is under `artifacts/hero-sequence/` and
  `artifacts/dashboard-scope/`; the earlier diagnostic is under
  `artifacts/motion-diagnosis/`. These recordings, screenshots, scripts, and logs
  are review artifacts and are deliberately excluded from this commit, along with
  secrets, node_modules, and build output.
- Remaining signing/deployment/tooling limits from the baseline below still apply.

## Previous baseline — d591033 (historical)

The following records the prior identity/toolchain checkpoint; its test counts,
process IDs, and timings are historical. Latest verification is listed above.


Continued from `33e9df4` (clean worktree at start). The requested ivory identity
was superseded by the user's dark charcoal + violet direction during this session.
No deployment was performed. Completed changes are saved as a Git checkpoint
(see the latest checkpoint commit in `git log`).

## Visual identity

- Charcoal `#171619` foundation, soft white typography, amethyst accents, restrained
  shadows and layered panels. No navy/cyan treatment or bright background glows.
- Preserved the original interlocking PactFlow ribbon geometry; recolored the
  inline mark, standalone symbol, lockup, monochrome asset and favicon for dark use.
- Matched badges, transaction controls, form surfaces, header, wallet modal and
  toasts to the dark palette.
- Escrow explanation has separate animated approve/release marks and a compact
  vertical mobile walkthrough. It remains explicitly illustrative, never live state.
- Added a milestone stage rail in expanded milestone cards. It highlights only
  the observed status, does not advance on a timer, and is omitted for disputed or
  refunded states. Timeline status entry animates only on observed state changes.
- Reduced-motion overrides keep diagrams readable with stationary lines/checkmarks.
- Final mobile review fixes: hide the secondary brand tagline below 380 px, use
  a two-column milestone rail on phones, and use native dark form controls.

## Toolchain repairs

- Installed Bun 1.4.3 at `/home/ubuntu/.local/pactflow-tools`, with `bun`/`bunx`
  symlinks in `/home/ubuntu/.local/bin` (already on the login PATH).
- `@circlefin/compass-chains` returns 404 from the official npm registry. Replaced
  that import with `scripts/compass-chains.ts`, an explicit metadata adapter using
  the installed viem definitions, with tests for Arc USDC gas/explorer, Base Sepolia
  native gas/explorer, and rejection of unknown/inherited keys. It does not select
  or replace any RPC. Supported Compass IDs are explicitly listed in that file;
  unknown IDs fail closed. The unavailable upstream registry cannot be compared
  for full chain coverage.
- Removed the unused Circle import. No lint/typecheck rules or exclusions relaxed.
- Added `bun run build` with a bounded Node heap. The first 3 GB build succeeded in
  2m 20s. A subsequent 3 GB build stalled under swap pressure and was terminated;
  a 2 GB retry also stalled under swap pressure. Bun's Vite attempt failed while
  loading config (esbuild service stopped). The final Node configuration uses
  1536 MB old space, 8 MB semi-space, optimize-for-size, and Rollup's
  maxParallelFileOps=32. All transformation/minification stages remain enabled.

## Integrity

No changes to Solidity, ABI, deployed addresses, wagmi hooks, RPC configuration,
routing hooks, transaction handlers, role gates, confirmation/refetch postconditions,
or synchronization utilities. The only deploy-script edit is its metadata import.
No wallet keys were used and no transactions were broadcast.

## Verification

- `bun test`: **154 pass, 0 fail**, 6 files (151 existing tests + 3 metadata tests).
- `bun run check`: **pass**, full type-aware lint and TypeScript check, no warnings.
- `forge test`: **79 pass, 0 fail, 0 skipped**, 17 suites, including invariants.
- `git diff --check`: pass.
- Final `bun run build`: **pass**, 6763 modules, **1m 25s**, using the bounded
  1536 MB heap and maxParallelFileOps=32. The earlier run of the same memory
  configuration also passed (1m 44s). Main JS: 1494.44 kB / 457.27 kB gzip.
- Final production-preview browser checks: dashboard, create, agreement #0,
  not-found and wallet modal at 1440, 390 and 320 px; no JS errors or horizontal
  overflow; actual Arc RPC responses 200 and real agreement data displayed.
- Interaction checks passed at all three widths: add/remove milestone, total amount
  preview (2.50 + 1.25 = 3.75), agreement navigation, history Back, expanded
  milestone rail highlighting Released from agreement #0. Header bounds and rail
  label widths pass at 320 px; no expanded-detail horizontal overflow.
- Reduced-motion emulation confirms the mobile walkthrough animation is `none`.
- Visually inspected final desktop hero and 320 px expanded milestone screenshots;
  also reviewed create/detail/wallet views and the compact mobile walkthrough.
- Production preview used port **4187** because 4173 is occupied.
- Design-review dev server: existing Vite process PID **1484204**, bound to
  **127.0.0.1:5173** in this project. Reused after checking port ownership; no
  duplicate dev server started. The existing SSH tunnel can use port 5173.
- Logs: `/tmp/pactflow-tests.log`, `/tmp/pactflow-forge.log`,
  `/tmp/pactflow-build.log`, `/tmp/pactflow-build-final.log`.
- Persistent browser evidence, logs and local QA scripts:
  `/home/ubuntu/pactflow-premium-review/2026-10-17/`.
  `results.json` covers 12 page/viewport combinations plus reduced motion;
  `interactions.json` covers three viewport sizes. Scripts use the local Playwright
  installation and the preview on port 4187. Screenshots are local review artifacts,
  not shipped in the app bundle.

## Remaining limits

- Signing actual fund/submit/approve/release/dispute/refund/withdraw operations with
  funder, builder and arbitrator wallets still requires a manual Arc Testnet session.
  Read-only browser checks and contract tests do not certify a real wallet signing flow.
- Vite reports third-party PURE annotation notices and a large main JS chunk. These
  warnings are not suppressed. Bundle splitting can be assessed separately without
  changing wallet loading behavior in this visual pass.
- Compass deployment engines (`@circlefin/compass-deploy` and
  `@circlefin/compass-ecosystem-evm`) remain dynamically loaded by the existing
  deployment CLI and are not installed here. No fork/live deployment was attempted;
  future deployment tooling needs its original private packages/access restored.
