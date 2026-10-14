import { createPublicClient, decodeEventLog, http, parseAbi, type Address, type Hex } from 'viem';
import { DEPLOYMENT_BLOCK, HUB, MONAD_TESTNET, publicClient, verifyHubDeployment } from '../contract';
import { deleteActivityAfter, readCursor, upsertActivity, writeCursor, type ActivityRecord } from './persistence';

export const HUB_EVENT_ABI = parseAbi([
 'event LoomCreated(uint256 indexed loomId,address indexed curator,string name)',
 'event LoomUpdated(uint256 indexed loomId)',
 'event LoomDeactivated(uint256 indexed loomId)',
 'event PostCreated(uint256 indexed postId,uint256 indexed loomId,address indexed creator,string contentURI,bytes32 contentHash)',
 'event AttentionStaked(uint256 indexed postId,address indexed supporter,uint256 amount)',
 'event StakeWithdrawn(uint256 indexed postId,address indexed supporter,uint256 amount)',
 'event TipDispatched(address indexed sender,address indexed creator,uint256 amount,uint256 fee)',
 'event RewardFunded(uint256 indexed postId,address indexed funder,uint256 amount)',
 'event RewardClaimed(uint256 indexed postId,address indexed account,uint256 amount,uint8 allocation)',
 'event CreatorWithdrawal(address indexed account,uint256 amount)',
 'event CuratorWithdrawal(address indexed account,uint256 amount)',
 'event ProtocolFeeWithdrawn(address indexed account,uint256 amount)',
 'event ConfigurationUpdated(uint16 tipFeeBps)',
 'event PauseUpdated(bool paused)',
 'event OwnershipTransferred(address indexed previousOwner,address indexed newOwner)',
]);
const chainClient=createPublicClient({chain:MONAD_TESTNET,transport:http(process.env.NEXT_PUBLIC_MONAD_RPC_URL||MONAD_TESTNET.rpcUrls.default.http[0])});
const MAX_SYNC_BLOCK_SPAN=2000n;const MAX_RPC_BLOCK_SPAN=100n;const MAX_LOGS_PER_SYNC=1000;const SYNC_THROTTLE_MS=10_000;
let runningSync:Promise<{scanned:number;stored:number;throughBlock:string}>|undefined;

function scalarArgs(args:Record<string,unknown>):ActivityRecord['args']{
 const output:ActivityRecord['args']={};
 for(const [key,value] of Object.entries(args)){
  if(typeof value==='bigint')output[key]=value.toString();
  else if(typeof value==='string'||typeof value==='boolean'||typeof value==='number')output[key]=value;
 }
 return output;
}
function walletFromArgs(args:Record<string,unknown>,from:string):string{
 for(const key of ['account','supporter','sender','curator','creator','funder','previousOwner','newOwner']){const value=args[key];if(typeof value==='string'&&/^0x[0-9a-fA-F]{40}$/.test(value))return value.toLowerCase();}
 return from.toLowerCase();
}
async function mapLimit<T,R>(items:T[],limit:number,fn:(item:T)=>Promise<R>):Promise<R[]>{
 const output=new Array<R>(items.length);let next=0;
 await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(true){const index=next++;if(index>=items.length)return;output[index]=await fn(items[index]);}}));return output;
}

async function syncOnce():Promise<{scanned:number;stored:number;throughBlock:string}>{
 if(!HUB||DEPLOYMENT_BLOCK===undefined)throw new Error('Verified Monad Testnet deployment metadata is required for activity indexing.');
 await verifyHubDeployment();
 if(await chainClient.getChainId()!==10143)throw new Error('Activity RPC is not connected to Monad Testnet (10143).');
 const hub=HUB;const now=Date.now();const head=await chainClient.getBlockNumber();let cursor=await readCursor(10143,hub);let from=cursor?BigInt(cursor.blockNumber)+1n:DEPLOYMENT_BLOCK;
 if(cursor){
  const cursorHeight=BigInt(cursor.blockNumber);let changed=cursorHeight>head;
  if(!changed){const oldBlock=await chainClient.getBlock({blockNumber:cursorHeight});changed=oldBlock.hash.toLowerCase()!==cursor.blockHash.toLowerCase();}
  if(changed){
   const candidate=BigInt(cursor.blockNumber)>DEPLOYMENT_BLOCK+12n?BigInt(cursor.blockNumber)-12n:DEPLOYMENT_BLOCK;const rollback=candidate>head?head:candidate;
   await deleteActivityAfter(10143,hub,rollback.toString());
   const rollbackBlock=await chainClient.getBlock({blockNumber:rollback});cursor={blockNumber:rollback.toString(),blockHash:rollbackBlock.hash,polledAt:0};await writeCursor(10143,hub,cursor);from=rollback+1n;
  }
 }
 if(cursor&&now-cursor.polledAt<SYNC_THROTTLE_MS)return{scanned:0,stored:0,throughBlock:cursor.blockNumber};
 const safeHead=head>5n?head-5n:0n;
 if(from>safeHead)return{scanned:0,stored:0,throughBlock:cursor?.blockNumber||String(DEPLOYMENT_BLOCK-1n)};
 const syncEnd=from+MAX_SYNC_BLOCK_SPAN-1n<safeHead?from+MAX_SYNC_BLOCK_SPAN-1n:safeHead;
 let to=from-1n;let nextFrom=from;const logs:Awaited<ReturnType<typeof chainClient.getLogs>>=[];
 while(nextFrom<=syncEnd&&logs.length<MAX_LOGS_PER_SYNC){
  let chunkEnd=nextFrom+MAX_RPC_BLOCK_SPAN-1n<syncEnd?nextFrom+MAX_RPC_BLOCK_SPAN-1n:syncEnd;
  let chunk=await chainClient.getLogs({address:hub,events:HUB_EVENT_ABI,fromBlock:nextFrom,toBlock:chunkEnd});
  while(logs.length+chunk.length>MAX_LOGS_PER_SYNC&&chunkEnd>nextFrom){chunkEnd=nextFrom+(chunkEnd-nextFrom)/2n;chunk=await chainClient.getLogs({address:hub,events:HUB_EVENT_ABI,fromBlock:nextFrom,toBlock:chunkEnd});}
  if(logs.length+chunk.length>MAX_LOGS_PER_SYNC)throw new Error(`A single block contains over ${MAX_LOGS_PER_SYNC} hub events; activity cursor was not advanced.`);
  logs.push(...chunk);to=chunkEnd;nextFrom=chunkEnd+1n;
 }
 const receiptCache=new Map<string,Promise<Awaited<ReturnType<typeof publicClient.getTransactionReceipt>>>>();
 const records=await mapLimit(logs,8,async(log)=>{
  const hash=log.transactionHash;if(!hash||log.blockNumber===null||!log.blockHash||log.logIndex===null)throw new Error('RPC returned an incomplete event log; cursor was not advanced.');
  let pending=receiptCache.get(hash);if(!pending){pending=publicClient.getTransactionReceipt({hash});receiptCache.set(hash,pending);}const [receipt,tx]=await Promise.all([pending,publicClient.getTransaction({hash})]);
  if(receipt.status!=='success'||tx.to?.toLowerCase()!==hub.toLowerCase()||receipt.blockNumber!==log.blockNumber||receipt.blockHash.toLowerCase()!==log.blockHash.toLowerCase())throw new Error(`Event transaction ${hash} failed receipt verification.`);
  const confirmedLog=receipt.logs.find(entry=>entry.logIndex===log.logIndex);
  if(!confirmedLog||confirmedLog.address.toLowerCase()!==hub.toLowerCase()||confirmedLog.data.toLowerCase()!==log.data.toLowerCase()||confirmedLog.topics.join(':').toLowerCase()!==log.topics.join(':').toLowerCase())throw new Error(`Event log ${hash}:${log.logIndex} did not match its successful receipt.`);
  const decoded=decodeEventLog({abi:HUB_EVENT_ABI,data:confirmedLog.data,topics:confirmedLog.topics,strict:true});const args=scalarArgs(decoded.args as Record<string,unknown>);
  const num=(name:string)=>{const value=args[name];return value===undefined?null:String(value);};const amount=args.amount===undefined?null:String(args.amount);
  return{chainId:10143,hubAddress:hub.toLowerCase(),transactionHash:hash.toLowerCase(),blockNumber:log.blockNumber.toString(),blockHash:log.blockHash.toLowerCase(),logIndex:Number(log.logIndex),eventType:decoded.eventName,walletAddress:walletFromArgs(args,tx.from),loomId:num('loomId'),postId:num('postId'),amountWei:amount,allocation:typeof args.allocation==='number'?args.allocation:null,args,confirmed:true,observedAt:new Date(now).toISOString()} satisfies ActivityRecord;
 });
 const stored=await upsertActivity(records);const block=await chainClient.getBlock({blockNumber:to});await writeCursor(10143,hub,{blockNumber:to.toString(),blockHash:block.hash,polledAt:now});
 return{scanned:logs.length,stored,throughBlock:to.toString()};
}
export async function syncConfirmedHubActivity(){if(runningSync)return runningSync;runningSync=syncOnce().finally(()=>{runningSync=undefined;});return runningSync;}
