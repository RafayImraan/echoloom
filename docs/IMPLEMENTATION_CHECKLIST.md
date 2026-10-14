# Implementation checklist

Updated 2026-10-14 after the complete-project pass.

## Implemented and locally verified

- [x] Solidity hub with Loom ownership, post attribution, native MON staking, refundable principal, creator tips, explicit reward funding, one-time pull claims, pause controls, and ownership/fee controls.
- [x] Foundry regression and invariant-style accounting coverage for reward backing, payout rollback, duplicate claims, deadlines, authorization, and reentrancy.
- [x] Responsive Next.js app with sample feed, wallet connect/network switching, Loom creation, and fail-closed deployment configuration.
- [x] Confirmed event indexing for Looms, posts, stakes, tips, withdrawals, and reward actions, with a bounded 20,000-block maximum per browser poll and 5-block confirmation delay.
- [x] Live Loom discovery from confirmed `LoomCreated` logs; Loom-filtered posts; post creation from selected active Looms.
- [x] Live stake, tip, reward funding, supporter/creator/curator claims, post principal withdrawal, and pending tip earnings withdrawal buttons call contract methods and wait for successful receipts.
- [x] Live wallet native balance, pending tip credit, recent wallet event history, per-post state, and event transaction links.
- [x] Sample Looms and feed cards remain marked as sample content and have no enabled on-chain write actions.
- [x] Windows setup/run, deployment simulation/broadcast separation, and post-deployment verification are documented.
- [x] Pinned Solidity 0.8.24 build, all Foundry tests, frontend typecheck/build, npm audit, static Slither analysis, and local HTTP smoke passed in this pass. See `VERIFICATION_REPORT.md` for commands and evidence.

## Limits and external steps

- [ ] Manual Monad Testnet deployment and live wallet transaction journey. No transaction was signed, broadcast, or sent in this pass.
- [x] Native image/text upload, versioned SHA-256 digest, local-only storage mode, and server-side Pinata IPFS pinning that returns a validated CID reference; local-only references cannot be published.
- [ ] Hosted indexer or cross-device persistence. Confirmed logs are read from the public RPC and cached in the browser; each sync is bounded, and the UI currently hydrates at most 100 recent Looms and 30 recent posts.
- [ ] Browser-wallet end-to-end transaction test against a deployed hub and funded test wallet.
- [ ] Independent professional security audit. This repository review and Slither report are not an audit.

The local application runs without deployment metadata in sample mode. Live controls are enabled only when the address, deployment transaction, deployment block, chain ID, RPC code, and receipt checks pass. Live-chain behavior remains unverified until the owner completes the separate manual deployment and small-value test sequence.
