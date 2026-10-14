# Architecture

`contracts/` contains the immutable Solidity hub, Foundry tests, and Monad Testnet deployment tooling. It records Loom/post metadata, content URI and hash, stakes, reward funding/claims, tips, and withdrawals. No contract changes were required for native upload because `createPost` already stores and emits both the URI and hash.

`web/` is a Next.js App Router app. It displays confirmed on-chain Looms and posts. Wallet reads/writes stay on Monad Testnet chain ID 10143 and deployment metadata verification remains fail-closed. Every write waits for a successful receipt before showing confirmation.

The upload UI sends content only after an explicit user action and public-content acknowledgement. It supports size-limited images and UTF-8 text/Markdown. A deterministic versioned SHA-256 digest binds normalized MIME type, length, and bytes; the API verifies it and stores bytes plus metadata using either local disk or server-side Supabase Storage. The returned reference and digest populate the existing on-chain post form. Upload and post creation are separate; the hash does not establish authorship, ownership, originality, or permanence.

The server activity API syncs recognized hub events from RPC in bounded ranges, waits five blocks, and confirms each candidate against a successful receipt and exact receipt log before storing. A persistent cursor and unique event key support idempotent retries; changed block hashes trigger a bounded rewind. The browser gets paginated confirmed events from the API and keeps pending wallet transactions only as transient UI state.

The local adapter stores activity and content beneath `web/data`, which is git-ignored and survives restarts, for single-process development. The optional Supabase/Postgres and Storage adapter is intended for hosted/shared persistence. See `INDEXING.md` and `DEPLOYMENT.md` for setup and limitations. Activity synchronization is request-triggered, not a background service. No hosted provider or deployed chain was used in the local verification run.
