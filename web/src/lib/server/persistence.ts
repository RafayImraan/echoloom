import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { isValidIpfsCid as validateIpfsCid } from '../content-reference.ts';

export type ActivityRecord = {
  chainId: 10143; hubAddress: string; transactionHash: string; blockNumber: string; blockHash: string;
  logIndex: number; eventType: string; walletAddress: string | null; loomId: string | null; postId: string | null;
  amountWei: string | null; allocation: number | null; args: Record<string, string | number | boolean>;
  confirmed: true; observedAt: string;
};
export type ActivityCursor = { blockNumber: string; blockHash: string; polledAt: number };
export type StoredContentMetadata = { version: 1; sha256: string; mediaType: string; size: number; algorithm: string; storedAt: string };
export type ActivityQuery = { limit: number; offset: number; wallet?: string; loomId?: string };

type LocalDatabase = { events: ActivityRecord[]; cursors: Record<string, ActivityCursor>; };
const EVENT_TYPES = new Set(['LoomCreated','LoomUpdated','LoomDeactivated','PostCreated','AttentionStaked','StakeWithdrawn','TipDispatched','RewardFunded','RewardClaimed','CreatorWithdrawal','CuratorWithdrawal','ProtocolFeeWithdrawn','ConfigurationUpdated','PauseUpdated','OwnershipTransferred']);
const DEFAULT_BUCKET = 'echoloom-content';
const MAX_LOCAL_ACTIVITY_RECORDS = 50_000;
let localQueue: Promise<unknown> = Promise.resolve();

export function configuredDriver(): 'local' | 'supabase' | 'pinata' {
  const value = process.env.ECHOLOOM_STORAGE_DRIVER?.trim().toLowerCase() || 'local';
  if (value !== 'local' && value !== 'supabase' && value !== 'pinata') throw new Error('ECHOLOOM_STORAGE_DRIVER must be local, supabase, or pinata.');
  if (value === 'supabase' && (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) throw new Error('Supabase storage requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.');
  return value;
}

function activityUsesSupabase(): boolean { return configuredDriver() === 'supabase'; }

function storageRoot(): string { return process.env.ECHOLOOM_DATA_DIR?.trim() || join(process.cwd(), 'data'); }
function localDbPath(): string { return join(storageRoot(), 'activity.json'); }
function cursorKey(chainId: number, hub: string): string { return `${chainId}:${hub.toLowerCase()}`; }
function eventKey(event: ActivityRecord): string { return `${event.chainId}:${event.hubAddress.toLowerCase()}:${event.transactionHash.toLowerCase()}:${event.logIndex}`; }

async function withLocalLock<T>(operation: () => Promise<T>): Promise<T> {
  const next = localQueue.then(operation, operation);
  localQueue = next.then(() => undefined, () => undefined);
  return next;
}
async function readLocalDb(): Promise<LocalDatabase> {
  try { return JSON.parse(await readFile(localDbPath(), 'utf8')) as LocalDatabase; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { events: [], cursors: {} }; throw error; }
}
async function writeLocalDb(database: LocalDatabase): Promise<void> {
  const path = localDbPath(); await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(database), { encoding: 'utf8', flag: 'wx' });
  await rename(temp, path);
}

function supabaseConfig(): { url: string; key: string; bucket: string } {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, ''); const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase storage requires server-only SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  return { url, key, bucket: process.env.SUPABASE_CONTENT_BUCKET?.trim() || DEFAULT_BUCKET };
}
async function supabaseRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const { url, key } = supabaseConfig();
  const response = await fetch(`${url}${path}`, { ...init, headers: { apikey: key, Authorization: `Bearer ${key}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers } });
  if (!response.ok) throw new Error(`Persistent storage request failed (${response.status}).`);
  return response;
}
function postgrest(path: string): string { return `/rest/v1/${path}`; }

export async function upsertActivity(records: ActivityRecord[]): Promise<number> {
  if (!records.length) return 0;
  if (records.some(record => !EVENT_TYPES.has(record.eventType) || record.chainId !== 10143 || record.confirmed !== true)) throw new Error('Activity batch contains an unsupported or unconfirmed record.');
  if (!activityUsesSupabase()) return withLocalLock(async () => {
    const db = await readLocalDb(); const known = new Set(db.events.map(eventKey)); let added = 0;
    for (const record of records) { const key = eventKey(record); if (!known.has(key)) { db.events.push(record); known.add(key); added++; } }
    db.events.sort((a,b)=>BigInt(a.blockNumber) < BigInt(b.blockNumber) ? -1 : BigInt(a.blockNumber) > BigInt(b.blockNumber) ? 1 : a.logIndex-b.logIndex);
    if(db.events.length>MAX_LOCAL_ACTIVITY_RECORDS)db.events.splice(0,db.events.length-MAX_LOCAL_ACTIVITY_RECORDS);
    await writeLocalDb(db); return added;
  });
  const response = await supabaseRequest(postgrest('echoloom_activity?on_conflict=chain_id,hub_address,transaction_hash,log_index'), { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify(records.map(toDatabaseRecord)) });
  const inserted = await response.json() as unknown[]; return inserted.length;
}

function toDatabaseRecord(event: ActivityRecord) { return { chain_id:event.chainId,hub_address:event.hubAddress.toLowerCase(),transaction_hash:event.transactionHash.toLowerCase(),block_number:event.blockNumber,block_hash:event.blockHash.toLowerCase(),log_index:event.logIndex,event_type:event.eventType,wallet_address:event.walletAddress?.toLowerCase()??null,loom_id:event.loomId,post_id:event.postId,amount_wei:event.amountWei,allocation:event.allocation,args:event.args,confirmed:event.confirmed,observed_at:event.observedAt }; }
function fromDatabaseRecord(row: Record<string, unknown>): ActivityRecord { return {chainId:10143,hubAddress:String(row.hub_address),transactionHash:String(row.transaction_hash),blockNumber:String(row.block_number),blockHash:String(row.block_hash),logIndex:Number(row.log_index),eventType:String(row.event_type),walletAddress:row.wallet_address?String(row.wallet_address):null,loomId:row.loom_id?String(row.loom_id):null,postId:row.post_id?String(row.post_id):null,amountWei:row.amount_wei?String(row.amount_wei):null,allocation:row.allocation===null?null:Number(row.allocation),args:row.args as ActivityRecord['args'],confirmed:true,observedAt:String(row.observed_at)}; }

export async function listActivity(query: ActivityQuery): Promise<ActivityRecord[]> {
  const {limit,offset,wallet,loomId}=query;
  if (!activityUsesSupabase()) { const db=await readLocalDb(); return db.events.filter(event=>(!wallet||event.walletAddress?.toLowerCase()===wallet.toLowerCase())&&(!loomId||event.loomId===loomId)).sort((a,b)=>BigInt(a.blockNumber)>BigInt(b.blockNumber)?-1:BigInt(a.blockNumber)<BigInt(b.blockNumber)?1:b.logIndex-a.logIndex).slice(offset,offset+limit); }
  const q=new URLSearchParams({select:'*',chain_id:'eq.10143',order:'block_number.desc,log_index.desc',limit:String(limit),offset:String(offset)});
  if(wallet)q.set('wallet_address',`eq.${wallet.toLowerCase()}`); if(loomId)q.set('loom_id',`eq.${loomId}`);
  const response=await supabaseRequest(postgrest(`echoloom_activity?${q}`)); const rows=await response.json() as Record<string,unknown>[]; return rows.map(fromDatabaseRecord);
}

export async function readCursor(chainId: number, hub: string): Promise<ActivityCursor | null> {
  if(!activityUsesSupabase())return withLocalLock(async()=>{const db=await readLocalDb();return db.cursors[cursorKey(chainId,hub)]??null;});
  const q=new URLSearchParams({select:'block_number,block_hash,polled_at',chain_id:`eq.${chainId}`,hub_address:`eq.${hub.toLowerCase()}`,limit:'1'});
  const response=await supabaseRequest(postgrest(`echoloom_indexer_state?${q}`));const rows=await response.json() as Record<string,unknown>[];return rows.length?{blockNumber:String(rows[0].block_number),blockHash:String(rows[0].block_hash),polledAt:new Date(String(rows[0].polled_at)).getTime()}:null;
}
export async function writeCursor(chainId:number,hub:string,cursor:ActivityCursor):Promise<void>{
  if(!activityUsesSupabase()){await withLocalLock(async()=>{const db=await readLocalDb();db.cursors[cursorKey(chainId,hub)]=cursor;await writeLocalDb(db);});return;}
  await supabaseRequest(postgrest('echoloom_indexer_state?on_conflict=chain_id,hub_address'),{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({chain_id:chainId,hub_address:hub.toLowerCase(),block_number:cursor.blockNumber,block_hash:cursor.blockHash.toLowerCase(),polled_at:new Date(cursor.polledAt).toISOString()})});
}
export async function deleteActivityAfter(chainId:number,hub:string,block:string):Promise<void>{
  if(!activityUsesSupabase()){await withLocalLock(async()=>{const db=await readLocalDb();db.events=db.events.filter(event=>event.chainId!==chainId||event.hubAddress.toLowerCase()!==hub.toLowerCase()||BigInt(event.blockNumber)<=BigInt(block));await writeLocalDb(db);});return;}
  const q=new URLSearchParams({chain_id:`eq.${chainId}`,hub_address:`eq.${hub.toLowerCase()}`,block_number:`gt.${block}`});await supabaseRequest(postgrest(`echoloom_activity?${q}`),{method:'DELETE',headers:{Prefer:'return=minimal'}});
}

export function isValidIpfsCid(cid: string): boolean {
  return validateIpfsCid(cid);
}

export async function saveContent(digest:string,bytes:Uint8Array,metadata:StoredContentMetadata):Promise<string | null>{
  if(!/^[0-9a-f]{64}$/.test(digest)||metadata.sha256!==`0x${digest}`)throw new Error('Invalid content digest.');
  if(configuredDriver()==='local'){
    await withLocalLock(async()=>{
      const root=join(storageRoot(),'uploads');await mkdir(root,{recursive:true});const target=join(root,digest);const manifest=join(root,`${digest}.json`);
      let existing:Buffer|undefined;try{existing=await readFile(target);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
      if(existing&&!existing.equals(Buffer.from(bytes)))throw new Error('A stored object with this digest has different bytes.');
      const contentTemp=`${target}.${randomUUID()}.tmp`,manifestTemp=`${manifest}.${randomUUID()}.tmp`;
      try{if(!existing){await writeFile(contentTemp,bytes,{flag:'wx'});await rename(contentTemp,target);}await writeFile(manifestTemp,JSON.stringify(metadata),{encoding:'utf8',flag:'wx'});await rename(manifestTemp,manifest);}
      catch(error){await Promise.all([rm(contentTemp,{force:true}),rm(manifestTemp,{force:true})]);throw error;}
    });
    return null;
  }
  if (configuredDriver() === 'pinata') {
    const jwt = process.env.PINATA_JWT?.trim();
    if (!jwt) throw new Error('IPFS uploads require PINATA_JWT configured on the server.');
    const form = new FormData();
    const blobBytes = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(blobBytes).set(bytes);
    form.append('file', new Blob([blobBytes], { type: metadata.mediaType }), `${digest}.${metadata.mediaType === 'text/markdown' ? 'md' : metadata.mediaType === 'text/plain' ? 'txt' : metadata.mediaType.split('/')[1]}`);
    form.append('network', 'public');
    form.append('name', `echoloom-${digest}`);
    form.append('keyvalues', JSON.stringify({ sha256: metadata.sha256, mediaType: metadata.mediaType, size: String(metadata.size), algorithm: metadata.algorithm }));
    let response: Response;
    try { response = await fetch('https://uploads.pinata.cloud/v3/files', { method: 'POST', headers: { Authorization: `Bearer ${jwt}` }, body: form, signal: AbortSignal.timeout(30_000) }); }
    catch { throw new Error('IPFS provider could not be reached. Check the server connection and try again.'); }
    if (!response.ok) throw new Error(`IPFS provider rejected the upload (${response.status}). Check the server-side Pinata credentials and quota.`);
    let result: { data?: { cid?: unknown } };
    try { result = await response.json() as { data?: { cid?: unknown } }; } catch { throw new Error('IPFS provider returned an invalid upload response.'); }
    if (typeof result.data?.cid !== 'string' || !isValidIpfsCid(result.data.cid)) throw new Error('IPFS provider returned a malformed content identifier.');
    let gatewayResponse: Response;
    try { gatewayResponse = await fetch(`https://gateway.pinata.cloud/ipfs/${result.data.cid}`, { signal: AbortSignal.timeout(20_000), cache: 'no-store' }); }
    catch { throw new Error('IPFS pin was accepted, but the public gateway could not verify it yet. Wait briefly and upload again if needed.'); }
    if (!gatewayResponse.ok) throw new Error(`IPFS pin was accepted, but the public gateway returned HTTP ${gatewayResponse.status}; the reference is not marked publishable.`);
    const retrieved = new Uint8Array(await gatewayResponse.arrayBuffer());
    if (retrieved.byteLength !== bytes.byteLength || retrieved.some((byte, index) => byte !== bytes[index])) throw new Error('IPFS gateway content did not match the uploaded file; the reference is not marked publishable.');
    return result.data.cid;
  }
  const {url,key,bucket}=supabaseConfig();
  for(const [path,body,type] of [[digest,bytes,metadata.mediaType],[`${digest}.json`,new TextEncoder().encode(JSON.stringify(metadata)),'application/json']] as const){
    const response=await fetch(`${url}/storage/v1/object/${bucket}/${path}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':type,'x-upsert':'true','Cache-Control':'public, max-age=31536000, immutable'},body:body as BodyInit});
    if(!response.ok)throw new Error(`Content storage request failed (${response.status}).`);
  }
  return null;
}
export async function loadContent(digest:string):Promise<{bytes:Uint8Array;metadata:StoredContentMetadata}|null>{
  if(!/^[0-9a-f]{64}$/.test(digest))return null;
  if(configuredDriver()==='local'){
    try{const root=join(storageRoot(),'uploads');const [bytes,json]=await Promise.all([readFile(join(root,digest)),readFile(join(root,`${digest}.json`),'utf8')]);return{bytes:new Uint8Array(bytes),metadata:JSON.parse(json) as StoredContentMetadata};}
    catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
  }
  const {url,key,bucket}=supabaseConfig();const [content,metadataResponse]=await Promise.all([fetch(`${url}/storage/v1/object/${bucket}/${digest}`,{headers:{apikey:key,Authorization:`Bearer ${key}`}}),fetch(`${url}/storage/v1/object/${bucket}/${digest}.json`,{headers:{apikey:key,Authorization:`Bearer ${key}`}})]);
  if(content.status===404||metadataResponse.status===404)return null;if(!content.ok||!metadataResponse.ok)throw new Error('Content storage read failed.');
  return{bytes:new Uint8Array(await content.arrayBuffer()),metadata:await metadataResponse.json() as StoredContentMetadata};
}
export function publicContentUrl(digest:string,origin:string):string{
 if(configuredDriver()==='local')return new URL(`/api/content/${digest}`,process.env.ECHOLOOM_APP_BASE_URL?.trim()||origin).toString();
 if(configuredDriver()==='pinata') throw new Error('IPFS references must be created from the provider-returned CID.');
 const {url,bucket}=supabaseConfig();return `${url}/storage/v1/object/public/${bucket}/${digest}`;
}
