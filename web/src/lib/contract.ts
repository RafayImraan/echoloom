import { createPublicClient, createWalletClient, custom, getAddress, http, isAddress, parseEther, type Address, type Hex } from 'viem';
import deployment from '../../deployment.json';

export const MONAD_TESTNET = { id: 10143, name: 'Monad Testnet', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } }, blockExplorers: { default: { name: 'Monad Explorer', url: 'https://testnet.monadscan.com' } } } as const;
const alchemyApiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY?.trim();
export const MONAD_RPC_URL = alchemyApiKey
 ? `https://monad-testnet.g.alchemy.com/v2/${alchemyApiKey}`
 : process.env.NEXT_PUBLIC_MONAD_RPC_URL?.trim() || MONAD_TESTNET.rpcUrls.default.http[0];
const configuredServerOrigin = process.env.ECHOLOOM_APP_BASE_URL?.trim();
const vercelProductionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
const defaultServerOrigin = process.env.NODE_ENV === 'production' ? 'https://echoloom-rho.vercel.app' : 'http://localhost:3000';
export const MONAD_RPC_ORIGIN = typeof window === 'undefined'
 ? (configuredServerOrigin || (vercelProductionHost ? `https://${vercelProductionHost}` : defaultServerOrigin)).replace(/\/+$/, '')
 : undefined;
export const MONAD_RPC_FETCH_OPTIONS = MONAD_RPC_ORIGIN ? { fetchOptions: { headers: { Origin: MONAD_RPC_ORIGIN } } } : undefined;
const deploymentMetadata = deployment as unknown as { chainId: number; address: string | null; transactionHash: string | null; deploymentBlock: string | null };
const envHub = process.env.NEXT_PUBLIC_ECHOLOOM_HUB?.trim() || '';
const artifactHub = deploymentMetadata.address?.trim() || '';
const envTx = process.env.NEXT_PUBLIC_ECHOLOOM_DEPLOYMENT_TX?.trim() || '';
const artifactTx = deploymentMetadata.transactionHash?.trim() || '';
const configuredTx = envTx || artifactTx;
const envBlock = process.env.NEXT_PUBLIC_ECHOLOOM_DEPLOYMENT_BLOCK?.trim() || '';
const artifactBlock = deploymentMetadata.deploymentBlock?.trim() || '';
const configuredHub = envHub || artifactHub;
const configuredBlock = envBlock || artifactBlock;
export const HUB_CONFIGURATION_ERROR = deploymentMetadata.chainId !== MONAD_TESTNET.id
 ? 'web/deployment.json is not a Monad Testnet deployment artifact.'
 : (envHub && !isAddress(envHub)) || (artifactHub && !isAddress(artifactHub))
 ? 'The configured EchoLoom hub address is not a valid EVM address.'
 : envHub && artifactHub && envHub.toLowerCase() !== artifactHub.toLowerCase()
 ? 'NEXT_PUBLIC_ECHOLOOM_HUB conflicts with the recorded deployment address; remove the stale override or update deployment metadata.'
 : envTx && artifactTx && envTx.toLowerCase() !== artifactTx.toLowerCase()
 ? 'NEXT_PUBLIC_ECHOLOOM_DEPLOYMENT_TX conflicts with the recorded deployment transaction.'
 : envBlock && artifactBlock && envBlock !== artifactBlock
 ? 'NEXT_PUBLIC_ECHOLOOM_DEPLOYMENT_BLOCK conflicts with the recorded deployment block.'
 : configuredHub && (!configuredTx || !configuredBlock)
 ? 'A hub address requires its actual deployment transaction hash and block number.'
 : configuredTx && !/^0x[0-9a-fA-F]{64}$/.test(configuredTx)
 ? 'The configured deployment transaction hash is invalid.'
 : configuredBlock && !/^\d+$/.test(configuredBlock)
 ? 'The configured deployment block must be a non-negative integer.'
 : undefined;
export const HUB: Address | undefined = !HUB_CONFIGURATION_ERROR && configuredHub ? getAddress(configuredHub) : undefined;
export const DEPLOYMENT_BLOCK = !HUB_CONFIGURATION_ERROR && configuredBlock ? BigInt(configuredBlock) : undefined;
export const publicClient = createPublicClient({ chain: MONAD_TESTNET, transport: http(MONAD_RPC_URL, MONAD_RPC_FETCH_OPTIONS) });

export async function verifyHubDeployment(): Promise<void> {
 if (!HUB) throw new Error(HUB_CONFIGURATION_ERROR || 'Set NEXT_PUBLIC_ECHOLOOM_HUB to enable contract interactions.');
 if (await publicClient.getChainId() !== MONAD_TESTNET.id) throw new Error('The configured RPC is not connected to Monad Testnet (chain ID 10143).');
 const code = await publicClient.getCode({ address: HUB });
 if (!code || code === '0x') throw new Error('No contract bytecode exists at the configured hub address on Monad Testnet.');
 if (!configuredTx || DEPLOYMENT_BLOCK === undefined) throw new Error('Deployment transaction and block metadata are required before using this hub.');
 const receipt = await publicClient.getTransactionReceipt({ hash: configuredTx as Hex });
 if (receipt.status !== 'success' || receipt.contractAddress?.toLowerCase() !== HUB.toLowerCase() || receipt.blockNumber !== DEPLOYMENT_BLOCK) {
   throw new Error('Recorded deployment receipt does not match the configured address and deployment block.');
 }
}

export const ABI = [
 { type: 'function', name: 'loomCount', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
 { type: 'function', name: 'postCount', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
 { type: 'function', name: 'posts', stateMutability: 'view', inputs: [{ name: '', type: 'uint256' }], outputs: [{ name: 'creator', type: 'address' }, { name: 'loomId', type: 'uint256' }, { name: 'contentURI', type: 'string' }, { name: 'contentHash', type: 'bytes32' }, { name: 'createdAt', type: 'uint64' }, { name: 'deadline', type: 'uint64' }, { name: 'creatorBps', type: 'uint16' }, { name: 'curatorBps', type: 'uint16' }, { name: 'supporterBps', type: 'uint16' }, { name: 'totalStake', type: 'uint256' }, { name: 'rewardPool', type: 'uint256' }, { name: 'active', type: 'bool' }, { name: 'creatorClaimed', type: 'bool' }, { name: 'curatorClaimed', type: 'bool' }] },
 { type: 'function', name: 'supporterClaimed', stateMutability: 'view', inputs: [{ name: '', type: 'uint256' }, { name: '', type: 'address' }], outputs: [{ type: 'bool' }] },
 { type: 'function', name: 'getLoomCore', stateMutability: 'view', inputs: [{ name: 'id', type: 'uint256' }], outputs: [{ name: 'curator', type: 'address' }, { name: 'active', type: 'bool' }, { name: 'creatorBps', type: 'uint16' }, { name: 'curatorBps', type: 'uint16' }, { name: 'supporterBps', type: 'uint16' }] },
 { type: 'function', name: 'getPostCore', stateMutability: 'view', inputs: [{ name: 'id', type: 'uint256' }], outputs: [{ name: 'creator', type: 'address' }, { name: 'loomId', type: 'uint256' }, { name: 'deadline', type: 'uint64' }, { name: 'totalStake', type: 'uint256' }, { name: 'rewardPool', type: 'uint256' }] },
 { type: 'function', name: 'stakeOf', stateMutability: 'view', inputs: [{ name: '', type: 'uint256' }, { name: '', type: 'address' }], outputs: [{ type: 'uint256' }] },
 { type: 'function', name: 'stakeWeight', stateMutability: 'view', inputs: [{ name: '', type: 'uint256' }, { name: '', type: 'address' }], outputs: [{ type: 'uint256' }] },
 { type: 'function', name: 'pendingWithdrawals', stateMutability: 'view', inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'uint256' }] },
 { type: 'function', name: 'stake', stateMutability: 'payable', inputs: [{ name: 'postId', type: 'uint256' }], outputs: [] },
 { type: 'function', name: 'fundReward', stateMutability: 'payable', inputs: [{ name: 'postId', type: 'uint256' }], outputs: [] },
 { type: 'function', name: 'tip', stateMutability: 'payable', inputs: [{ name: 'creator', type: 'address' }], outputs: [] },
 { type: 'function', name: 'claimReward', stateMutability: 'nonpayable', inputs: [{ name: 'postId', type: 'uint256' }, { name: 'allocation', type: 'uint8' }], outputs: [] },
 { type: 'function', name: 'withdrawStake', stateMutability: 'nonpayable', inputs: [{ name: 'postId', type: 'uint256' }], outputs: [] },
 { type: 'function', name: 'withdrawEarnings', stateMutability: 'nonpayable', inputs: [], outputs: [] },
 { type: 'function', name: 'createPost', stateMutability: 'nonpayable', inputs: [{ name: 'loomId', type: 'uint256' }, { name: 'contentURI', type: 'string' }, { name: 'contentHash', type: 'bytes32' }], outputs: [{ type: 'uint256' }] },
 { type: 'function', name: 'createLoom', stateMutability: 'nonpayable', inputs: [{ name: 'name', type: 'string' }, { name: 'description', type: 'string' }, { name: 'category', type: 'string' }, { name: 'creatorBps', type: 'uint16' }, { name: 'curatorBps', type: 'uint16' }, { name: 'supporterBps', type: 'uint16' }, { name: 'stakeWindow', type: 'uint64' }], outputs: [{ type: 'uint256' }] },
] as const;

type ActionOptions = { id?: string; amount?: string; creator?: Address; loomId?: string; contentURI?: string; contentHash?: Hex; name?: string; description?: string; category?: string; creatorBps?: number; curatorBps?: number; supporterBps?: number; stakeWindow?: number };
export async function submit(action: 'stake'|'reward'|'tip'|'claim-supporter'|'claim-creator'|'claim-curator'|'withdraw-stake'|'withdraw-earnings'|'create-post'|'create-loom', account: Address, options: ActionOptions = {}): Promise<Hex> {
 if (!HUB) throw new Error(HUB_CONFIGURATION_ERROR || 'Set NEXT_PUBLIC_ECHOLOOM_HUB to enable contract actions.');
 await verifyHubDeployment();
 if (!window.ethereum) throw new Error('Install or unlock an injected wallet to continue.');
 const chainId = Number(await window.ethereum.request({ method: 'eth_chainId' }));
 if (chainId !== MONAD_TESTNET.id) throw new Error('Switch your wallet to Monad Testnet (chain ID 10143).');
 const client = createWalletClient({ account, chain: MONAD_TESTNET, transport: custom(window.ethereum) });
 const id = options.id ? BigInt(options.id) : 0n;
 const amount = options.amount ? parseEther(options.amount) : 0n;
 if (action === 'stake') return client.writeContract({ address: HUB, abi: ABI, functionName: 'stake', args: [id], value: amount });
 if (action === 'reward') return client.writeContract({ address: HUB, abi: ABI, functionName: 'fundReward', args: [id], value: amount });
 if (action === 'tip') { if (!options.creator) throw new Error('Creator address is missing.'); return client.writeContract({ address: HUB, abi: ABI, functionName: 'tip', args: [options.creator], value: amount }); }
 if (action === 'claim-supporter' || action === 'claim-creator' || action === 'claim-curator') {
   const allocation = action === 'claim-supporter' ? 0 : action === 'claim-creator' ? 1 : 2;
   return client.writeContract({ address: HUB, abi: ABI, functionName: 'claimReward', args: [id, allocation] });
 }
 if (action === 'withdraw-stake') return client.writeContract({ address: HUB, abi: ABI, functionName: 'withdrawStake', args: [id] });
 if (action === 'withdraw-earnings') return client.writeContract({ address: HUB, abi: ABI, functionName: 'withdrawEarnings', args: [] });
 if (action === 'create-post') {
   if (!options.loomId || !options.contentURI || !options.contentHash) throw new Error('Post details are incomplete.');
   return client.writeContract({ address: HUB, abi: ABI, functionName: 'createPost', args: [BigInt(options.loomId), options.contentURI, options.contentHash] });
 }
 if (!options.name || !options.category || options.creatorBps === undefined || options.curatorBps === undefined || options.supporterBps === undefined || options.stakeWindow === undefined) throw new Error('Loom configuration is incomplete.');
 return client.writeContract({ address: HUB, abi: ABI, functionName: 'createLoom', args: [options.name, options.description || '', options.category, options.creatorBps, options.curatorBps, options.supporterBps, BigInt(options.stakeWindow)] });
}

declare global { interface Window { ethereum?: { request(args: { method: string; params?: unknown[] }): Promise<unknown>; on?(event: string, listener: (value: unknown) => void): void } } }
