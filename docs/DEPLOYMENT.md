# Deployment preparation

## Current status

The repository is prepared for a manually authorized Monad Testnet deployment, but no deployment, signing, broadcast, or live transaction has been performed. The local Phase 3 results are in [VERIFICATION_REPORT.md](VERIFICATION_REPORT.md); they are not live-chain verification or an independent professional audit. Use only a dedicated test wallet and expendable test MON. Do not use mainnet.

## What the repository enforces

- `contracts/foundry.toml` pins Solidity 0.8.24, optimizer enabled, 200 optimizer runs, and IR compilation. The deployment script and hub both declare `pragma ^0.8.24`.
- `script/Deploy.s.sol` checks `block.chainid == 10143` and requires `MONAD_TESTNET_RPC_URL` to equal `https://testnet-rpc.monad.xyz` before `vm.startBroadcast`. It reads `DEPLOYER_PRIVATE_KEY` from the environment, checks a minimum deployer balance of 0.01 MON, and deploys `EchoLoomHub()` with no constructor arguments.
- `script/Record-Deployment.ps1` accepts only chain 10143 metadata for a successful EchoLoomHub CREATE receipt whose transaction hash and contract address match. It records the address, hash, and block; it does not invent values.
- The browser requires a valid hub address, transaction hash, and deployment block. It rejects conflicting environment overrides, checks that the RPC answers chain ID 10143, requires nonempty code, and checks the successful deployment receipt address and block before reads or writes. An empty/missing deployment artifact disables live contract actions.

The build profile and script checks prevent this script from proceeding against a wrong chain ID or a different RPC URL. This does not protect a compromised machine, a malicious RPC that lies about chain state, or an operator who changes the source/configuration; inspect the exact repository state and RPC response before proceeding.

## Manual Windows CMD procedure

Run the following from **Command Prompt**. First verify Foundry and the endpoint. Expected `cast chain-id` output is `10143`:

```cmd
cd /d C:\Users\HomePC\Documents\hey\contracts
"%USERPROFILE%\.foundry\bin\forge.exe" --version
"%USERPROFILE%\.foundry\bin\cast.exe" chain-id --rpc-url https://testnet-rpc.monad.xyz
```

Build with the exact installed Solidity 0.8.24 binary. This command does not connect to a wallet or send a transaction:

```cmd
"%USERPROFILE%\.foundry\bin\forge.exe" build --use C:\Users\HomePC\.solc-select\artifacts\solc-0.8.24\solc-0.8.24
```

### Simulate only

From CMD, run the following command. PowerShell will ask for the test wallet key using a hidden secure prompt, pass it to Forge only as a process environment variable, and remove that variable when Forge exits. The key is not part of the command text or shell history. Do not paste it into chat, a source file, or a `NEXT_PUBLIC_*` setting.

```cmd
powershell.exe -NoProfile -Command "$secure=Read-Host 'Test wallet private key (hidden input)' -AsSecureString; $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure); try { $env:MONAD_TESTNET_RPC_URL='https://testnet-rpc.monad.xyz'; $env:DEPLOYER_PRIVATE_KEY=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr); Set-Location 'C:\Users\HomePC\Documents\hey\contracts'; $forge=Join-Path $env:USERPROFILE '.foundry\bin\forge.exe'; & $forge script script/Deploy.s.sol:Deploy --rpc-url $env:MONAD_TESTNET_RPC_URL --chain 10143 --use 'C:\Users\HomePC\.solc-select\artifacts\solc-0.8.24\solc-0.8.24'; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } } finally { if ($ptr) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }; Remove-Item Env:DEPLOYER_PRIVATE_KEY -ErrorAction SilentlyContinue }"
```

This invocation omits `--broadcast`, so Forge simulates and does not sign/send a chain transaction. Inspect the compiler, chain, deployer address, balance, and simulated deployment output. The only expected interactive prompt is the hidden local key-entry prompt; the simulation itself does not ask for a broadcast confirmation.

### Broadcast, only when you decide to authorize it

The command below is provided for your review, not executed here. It repeats the hidden key prompt and adds `--broadcast`. Foundry signs and sends with the environment key; **do not expect a separate confirmation prompt**. Running it is the explicit broadcast action. Check the chain ID output, source/compiler settings, wallet, and test MON amount yourself before running it.

```cmd
powershell.exe -NoProfile -Command "$secure=Read-Host 'Test wallet private key (hidden input)' -AsSecureString; $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure); try { $env:MONAD_TESTNET_RPC_URL='https://testnet-rpc.monad.xyz'; $env:DEPLOYER_PRIVATE_KEY=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr); Set-Location 'C:\Users\HomePC\Documents\hey\contracts'; $forge=Join-Path $env:USERPROFILE '.foundry\bin\forge.exe'; & $forge script script/Deploy.s.sol:Deploy --rpc-url $env:MONAD_TESTNET_RPC_URL --chain 10143 --use 'C:\Users\HomePC\.solc-select\artifacts\solc-0.8.24\solc-0.8.24' --broadcast; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } } finally { if ($ptr) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }; Remove-Item Env:DEPLOYER_PRIVATE_KEY -ErrorAction SilentlyContinue }"
```

After the broadcast completes, check its transaction hash and successful receipt independently before recording metadata. In CMD:

```cmd
cd /d C:\Users\HomePC\Documents\hey\contracts
powershell.exe -NoProfile -ExecutionPolicy Bypass -File script\Record-Deployment.ps1
```

The recorder reads Foundry's `broadcast\Deploy.s.sol\10143\run-latest.json` and writes `web/deployment.json` only if chain, transaction, address, and successful receipt checks pass. Review the generated artifact. Do not type estimated or copied-from-simulation values into it. Restart the web app after a real deployment is recorded.

## Post-deployment verification checklist

These are steps for the operator after an authorized broadcast; none has been performed in this workspace:

1. **Network and receipt:** `cast chain-id --rpc-url https://testnet-rpc.monad.xyz` returns `10143`. Look up the recorded deployment transaction hash on Monad Testnet, confirm success, and confirm its receipt's `contractAddress` and block match `web/deployment.json`.
2. **Address and code:** confirm the address from the successful receipt equals the recorded address. Query its runtime bytecode on chain and confirm it is nonempty. Compare it byte-for-byte with the locally built `out/EchoLoomHub.sol/EchoLoomHub.json` `deployedBytecode.object` compiled with the pinned profile, or complete the explorer's source verification with the same compiler, optimizer, and IR settings. Nonempty code alone does not establish source equivalence.
3. **Deployment metadata:** check `chainId: 10143`, checksum-valid contract address, actual transaction hash, and decimal deployment block in `web/deployment.json`. The explorer link must point to that same transaction. Keep `web/.env.local` address/hash/block unset or make each exactly match the artifact; do not retain stale overrides.
4. **Events:** inspect the deployment receipt and subsequent `LoomCreated`, `PostCreated`, `AttentionStaked`, `TipDispatched`, `RewardFunded`, `RewardClaimed`, and `StakeWithdrawn` logs. Confirm indexed IDs, participant addresses, values, and transaction hashes against contract state and receipts. The app waits for five confirmations for its feed indexing; this buffer is not a finality guarantee.
5. **Frontend:** restart the app with matching metadata, connect an injected test wallet on chain 10143, verify the displayed hub address and post/event data, and confirm wrong-chain, missing-address, missing-hash/block, and mismatched-metadata states disable writes. The client checks RPC chain, code presence, and deployment receipt; the operator must still verify runtime code/source equivalence.
6. **Every transaction receipt:** record each submitted hash; check `status = success`, expected `to` address, sender, block, emitted event, and resulting state. A wallet prompt or submitted hash alone is not confirmation.

## Safe low-value contract exercise

The contract supports the following sequence. Every write below is a separate transaction and needs an independent successful receipt before the next dependent step. Loom creation is available in the frontend form. After creation, the live Loom browser discovers it from the confirmed `LoomCreated` event; verify the actual event and Loom ID in the transaction receipt.

1. **Create a Loom** in the app with a one-hour window and conservative allocations whose BPS total is at most 10,000, for example creator 2,000, curator 1,000, supporters 7,000. The caller becomes curator. The form validates values and reports success only after a successful receipt; confirm its `LoomCreated` event and note the actual Loom ID.
2. **Create a post** under that Loom. Use the frontend's post form with a real content URI and its corresponding 32-byte content hash. Confirm `PostCreated` and note the actual post ID and deadline. Post creation is a separate transaction after Loom creation.
3. **Stake** a small test amount from a supporter wallet before the deadline. This sends principal into the hub; it is not a fee, but remains locked until the deadline. Each stake is a separate transaction. The wallet also needs gas.
4. **Tip** the post creator from a different wallet (self-tipping is rejected). Tipping can be tested independently of reward settlement; the tip sender needs the tip amount plus gas, and the creator receives a pull credit rather than an immediate transfer. The creator can then submit a separate `withdrawEarnings` transaction from the live wallet summary.
5. **Fund rewards** with a small amount before the same post deadline. This is a separate transaction and requires additional MON plus gas. Stake and reward funding must both occur before the deadline; do not rely on a transaction submitted at the boundary.
6. **Wait until the post deadline has passed**, then confirm the chain timestamp/state. Claim supporter, creator, and curator allocations from the corresponding accounts. Each allocation is a separate `claimReward` transaction; creator and curator can be the same account, but still need distinct claims. Only claim roles that have a nonzero allocation and funded amount.
7. **Withdraw stake principal** after the deadline in a separate transaction from the supporter account. Verify the `StakeWithdrawn` event, receipt, and account balance. Claiming rewards and withdrawing principal are independent transactions and either may be submitted first after settlement.

Test accounts need test MON for gas. The deployer needs at least 0.01 MON per the script check, plus practical gas headroom. A supporter needs stake principal and gas; the reward funder needs the selected reward amount and gas; the tipper needs tip value and gas. Do not test with real funds. A local unit test passing does not prove this live sequence works; only successful testnet receipts and state/event verification do.

## Mainnet

Mainnet deployment is out of scope and unsupported. The deploy script's chain and RPC checks are fixed to Monad Testnet; do not edit them to target another network for this exercise.

## App storage setup

The app can be run locally without a database account. In `web/.env.local`, use `ECHOLOOM_STORAGE_DRIVER=local`; the default data path is `web/data`, which is git-ignored and persists across restarts on the same machine. Do not use multiple app processes with the local adapter.

For hosted/shared persistence, create a Supabase project, apply `supabase/migrations/202610140001_echoloom_persistent_storage.sql` in its SQL editor, then set these server-only variables in the hosting environment:

```text
ECHOLOOM_STORAGE_DRIVER=supabase
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
SUPABASE_CONTENT_BUCKET=echoloom-content
ECHOLOOM_APP_BASE_URL=https://YOUR_APP_HOST
```

Never put the service-role key in `NEXT_PUBLIC_*`, source control, or browser config. The migration leaves activity tables inaccessible to anonymous/authenticated API roles and allows service-role access. The content bucket is intentionally public because its references are published with on-chain posts. Apply the provider's current storage/database quotas and pricing to your account; no paid service is needed for the local demo. Test these values in a non-production environment first. Changing storage modes does not migrate existing local files or activity rows automatically.

For publishable IPFS content, create a Pinata account and an API JWT with IPFS file pinning permission. In `web/.env.local`, set `ECHOLOOM_STORAGE_DRIVER=pinata` and `PINATA_JWT=<your server-only JWT>`, then restart Next.js. Do not use a `NEXT_PUBLIC_` variable or commit the JWT. The app requests CIDv1, stores the app's SHA-256 metadata with the pin, and returns `ipfs://<CID>`; the live contract already accepts this URI format and its `bytes32` content hash, so no redeployment is needed. To manually test, connect the deployed Monad Testnet hub, choose a supported public file and acknowledge it is public, upload and wait for the CID, verify the displayed hash, then click Publish and review/confirm the separate create-post transaction in MetaMask. Check the successful receipt and `PostCreated` event on Monad Testnet Explorer. This procedure is not evidence of a real upload or transaction until you perform it with your own provider credentials and wallet. Provider quotas/pricing and gateway availability are external.

On every client refresh of the live panel, the server attempts a throttled, bounded Monad Testnet event sync. It stores only successful, receipt-verified hub logs and returns paginated confirmed history. It is not a continuously running indexing worker; idle periods are caught up on a later request. Local app tests do not establish hosted Supabase availability or live RPC behavior.
