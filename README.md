# EchoLoom

EchoLoom is a community publishing app built for **Monad Testnet**. People create communities called **Looms**, publish text or image posts, and support posts with MON stakes, tips, and funded rewards.

## What it does

- Create and browse community Looms.
- Publish posts with content stored locally during development, on Supabase Storage, or on IPFS through Pinata.
- Verify and display post content against its on-chain SHA-256 digest.
- Stake MON on posts, tip creators, fund reward pools, claim eligible rewards, and withdraw funds.
- Index confirmed contract events for the recent activity feed.
- Connect an injected EVM wallet, such as MetaMask, on Monad Testnet.

## How rewards work

Staked MON is principal and is not slashed. A supporter can withdraw their stake after the Loom's staking window closes. Rewards are a separate pool funded with MON and distributed according to the shares configured for that Loom. Tips are sent to creators, subject to the contract's protocol fee. Rewards and tips are not guaranteed returns.

## Tech stack

- **Web app:** Next.js App Router, React, TypeScript, and viem (`web/`)
- **Smart contract:** Solidity and Foundry (`contracts/`)
- **Persistent hosted storage:** Supabase SQL and Storage (`supabase/migrations/`)
- **Optional RPC provider:** Alchemy Monad Testnet Node API
- **Optional IPFS uploads:** Pinata

The deployed hub's chain ID, address, deployment transaction, and block are recorded in [`web/deployment.json`](web/deployment.json). The app checks the network and deployment metadata before enabling contract actions.

## Run locally

Requirements: Node.js and npm. Foundry is needed only to build or test the contracts.

```powershell
cd web
npm.cmd install
npm.cmd run dev
```

Open [http://localhost:3000](http://localhost:3000). Connect a wallet configured for Monad Testnet (chain ID `10143`) to use on-chain features.

### Optional environment settings

Create `web/.env.local` only for the services you want to use. The app uses the public Monad Testnet RPC by default.

```dotenv
# Optional Alchemy Monad Testnet RPC. Takes precedence over NEXT_PUBLIC_MONAD_RPC_URL.
NEXT_PUBLIC_ALCHEMY_API_KEY=

# Optional alternative RPC URL, used when no Alchemy key is set.
NEXT_PUBLIC_MONAD_RPC_URL=

# Optional: uncomment after applying the Supabase migration and adding credentials.
# ECHOLOOM_STORAGE_DRIVER=supabase
# SUPABASE_URL=
# SUPABASE_SERVICE_ROLE_KEY=
# SUPABASE_CONTENT_BUCKET=echoloom-content

# Optional: choose Pinata for IPFS uploads instead of Supabase Storage.
# ECHOLOOM_STORAGE_DRIVER=pinata
# PINATA_JWT=
```

Apply [`supabase/migrations/202610140001_echoloom_persistent_storage.sql`](supabase/migrations/202610140001_echoloom_persistent_storage.sql) to the Supabase project before enabling the `supabase` storage driver. Keep `SUPABASE_SERVICE_ROLE_KEY` and `PINATA_JWT` server-side; never use a `NEXT_PUBLIC_` prefix for them. The Alchemy key is browser-visible by design, so restrict its allowed origins to your local or deployed app domains in Alchemy.

With the default `local` storage driver, activity and uploads use the local development filesystem. That storage is not durable across serverless deployments. Use Supabase for hosted persistent activity/storage, or Pinata for IPFS content uploads. Pinata does not replace persistent activity storage.

## Deploy to Vercel

1. Import this repository into Vercel and set **Root Directory** to `web`.
2. Add the required environment variables for the selected hosted storage provider in **Project Settings > Environment Variables**.
3. Optionally add `NEXT_PUBLIC_ALCHEMY_API_KEY` for Alchemy Monad Testnet RPC and restrict the key to the deployed domain.
4. Deploy, then connect a wallet on Monad Testnet and verify Looms, posts, and recent activity.

Do not add `.env.local`, `contracts/.env`, private keys, service-role keys, or Pinata JWTs to Git. The repository ignore rules exclude environment files.

## Development checks

From `web/`:

```powershell
npm.cmd run typecheck
npm.cmd run test:server
npm.cmd run build
```

Build and test the Solidity contracts from `contracts/` with Foundry:

```powershell
forge build
forge test -vv
```

The contract project uses Solidity `0.8.24` with optimizer enabled and `via_ir = true`, as configured in `contracts/foundry.toml`.

## Project layout

```text
contracts/                 Solidity hub, Foundry tests, deployment scripts
supabase/migrations/       Supabase schema and storage setup
web/                       Next.js app, API routes, and deployment metadata
```
