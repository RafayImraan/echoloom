# EchoLoom

EchoLoom is a Monad Testnet app for community feeds (Looms), posts, MON stakes, tips, and funded rewards. It uses a Solidity hub and a Next.js client.

## Status

`web/deployment.json` records a Monad Testnet deployment address, transaction hash, and block. The frontend checks the configured chain, runtime code, and deployment receipt before enabling on-chain actions. This repository has not received an independent professional audit, and the metadata record alone is not a fresh live-chain verification.

## Architecture

- `contracts/`: Solidity hub, Foundry test suite, deployment script.
- `web/`: Next.js App Router client with injected-wallet support, persistent activity, and content uploads.
- `docs/`: architecture, security, tokenomics, and deployment instructions.

Funds use pull accounting. A post stake is principal and is never slashed; it can be withdrawn after its Loom's staking window. A separately funded pool is split among the post creator, Loom curator, and stakers, using the percentages configured when the Loom was created. Staker claims are proportional to recorded stake. No rank or engagement score mints or transfers funds.

## Windows setup

Prerequisites: Node.js 22.13+ (for the built-in TypeScript server-test runner), npm, and (for Solidity tests/deployments) Foundry plus forge-std. The contract build uses the exact Solidity 0.8.24 compiler required by `contracts/foundry.toml` (optimizer enabled, 200 runs, `via_ir = true`).

```powershell
cd web
npm.cmd install
npm.cmd run dev
```

Open `http://localhost:3000`. Connect an injected wallet, then create a Loom or use the confirmed on-chain posts. After deployment metadata is configured, the app discovers Looms and posts and enables post creation, staking, tipping, reward funding and claims, stake withdrawal, and tip withdrawal. Writes show confirmation only after a successful receipt. `contracts/script/Record-Deployment.ps1` records the actual deployment address, transaction, and block in `web/deployment.json`.

## Contracts

```powershell
cd contracts
& "$env:USERPROFILE\.foundry\bin\forge.exe" build --use "$env:USERPROFILE\.solc-select\artifacts\solc-0.8.24\solc-0.8.24"
& "$env:USERPROFILE\.foundry\bin\forge.exe" test --use "$env:USERPROFILE\.solc-select\artifacts\solc-0.8.24\solc-0.8.24" -vv
```

The recorded Phase 3 run used Foundry 1.8.5 and Solidity 0.8.24: 20 tests passed, including a 256-run fuzz property. See [verification report](docs/VERIFICATION_REPORT.md) for exact commands, reproducibility evidence, and static-analysis findings.

## Testnet deployment

Target is Monad Testnet only (chain ID 10143, `https://testnet-rpc.monad.xyz`). The script checks chain ID and RPC URL, reads `DEPLOYER_PRIVATE_KEY` from the process environment, checks deployer balance, and uses the no-argument constructor. See [deployment instructions](docs/DEPLOYMENT.md). Use only expendable test MON and a dedicated test wallet.

The live feed synchronizes confirmed hub events through server API routes into persistent storage. See [content and activity setup](docs/INDEXING.md). Users may explicitly upload public PNG/JPEG/WebP/GIF images (5 MiB max) or UTF-8 text/Markdown (256 KiB max). Local uploads are development-only and cannot be published. For publishable IPFS uploads, set server-only `ECHOLOOM_STORAGE_DRIVER=pinata` and `PINATA_JWT`; the app validates Pinata's returned CIDv1 and writes `ipfs://<CID>` plus the versioned SHA-256 digest into the existing post form. Uploading and creating an on-chain post are separate actions. The contract already accepts URI and hash, so no redeployment is required. Hashes and CIDs do not prove authorship or originality, and pinning alone is not a permanence guarantee. Explorer: `https://testnet.monadscan.com`.

## Configuration

Local mode needs no environment file, account, or secret. For IPFS uploads, set `ECHOLOOM_STORAGE_DRIVER=pinata` and the server-only `PINATA_JWT` in `web/.env.local`. Supabase hosted activity/storage uses server-only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Never expose provider credentials through `NEXT_PUBLIC_` variables.

## Economics and limits

Read [TOKENOMICS](docs/TOKENOMICS.md), [SECURITY](docs/SECURITY.md), and [DEPLOYMENT](docs/DEPLOYMENT.md). Tips have a configurable protocol fee and use pull withdrawals. Reward pools must be funded with actual MON. Positions must reach their deadline before principal withdrawal and reward claims. No APY or guaranteed return is promised.

The app requires a verified Monad Testnet deployment before on-chain posts and wallet actions are available.
