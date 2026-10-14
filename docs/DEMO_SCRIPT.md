# Run and use EchoLoom

## Start locally

```cmd
cd /d C:\Users\HomePC\Documents\hey\web
npm.cmd install
npm.cmd run dev
```

Open `http://localhost:3000`. Local uploads and activity persist under `web/data`. A verified Monad Testnet deployment is required to load on-chain posts or submit contract transactions.

## Main flow

1. Connect a wallet on Monad Testnet (chain ID 10143).
2. Create a Loom and confirm its transaction receipt.
3. Select a Loom, choose public image/text content, confirm it is public, and upload. Or provide an existing HTTPS/IPFS reference and hash.
4. Publish the post in a separate wallet transaction.
5. Stake, tip, or fund rewards through separate transactions. After the staking deadline, eligible users can claim rewards and withdraw stake.
6. Check each transaction receipt and its Monad Explorer link.

Only uploaded content can be hashed by the app. The SHA-256 digest binds its bytes and media type; it does not prove authorship, ownership, originality, or permanence. Uploaded content is public.
