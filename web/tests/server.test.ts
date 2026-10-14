import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { canonicalContentBytes, sha256ContentHash, TEXT_MAX_BYTES } from '../src/lib/content-hash.ts';
import { isPublishableContentReference } from '../src/lib/content-reference.ts';
import { validateContentUpload } from '../src/lib/server/upload-validation.ts';
import { configuredDriver, listActivity, loadContent, readCursor, saveContent, upsertActivity, writeCursor, type ActivityRecord } from '../src/lib/server/persistence.ts';

const oldDriver=process.env.ECHOLOOM_STORAGE_DRIVER;const oldDataDir=process.env.ECHOLOOM_DATA_DIR;let testDir='';
function testCid(){const input=[1,0x55,0x12,0x20,...Array.from({length:32},(_,i)=>i)];const alphabet='abcdefghijklmnopqrstuvwxyz234567';let out='b',acc=0,bits=0;for(const byte of input){acc=(acc<<8)|byte;bits+=8;while(bits>=5){bits-=5;out+=alphabet[(acc>>bits)&31];}acc&=(1<<bits)-1;}if(bits)out+=alphabet[(acc<<(5-bits))&31];return out;}
test.before(async()=>{testDir=await mkdtemp(join(tmpdir(),'echoloom-server-tests-'));process.env.ECHOLOOM_STORAGE_DRIVER='local';process.env.ECHOLOOM_DATA_DIR=testDir;});
test.after(async()=>{if(oldDriver===undefined)delete process.env.ECHOLOOM_STORAGE_DRIVER;else process.env.ECHOLOOM_STORAGE_DRIVER=oldDriver;if(oldDataDir===undefined)delete process.env.ECHOLOOM_DATA_DIR;else process.env.ECHOLOOM_DATA_DIR=oldDataDir;await rm(testDir,{recursive:true,force:true});});

test('canonical content hash is deterministic and binds media type, byte length, and bytes',async()=>{
 const bytes=new TextEncoder().encode('A short public post.');const input=canonicalContentBytes('text/plain',bytes);const expected=`0x${createHash('sha256').update(input).digest('hex')}`;
 assert.equal(await sha256ContentHash('text/plain',bytes),expected);assert.notEqual(await sha256ContentHash('text/markdown',bytes),expected);
});

test('upload validation accepts supported text and checks MIME, extension, and UTF-8',()=>{
 const bytes=new TextEncoder().encode('# Hello\n');assert.deepEqual(validateContentUpload('hello.md','text/markdown',bytes),{mediaType:'text/markdown',size:bytes.byteLength});
 assert.throws(()=>validateContentUpload('hello.png','image/png',bytes),/PNG header/);
 assert.throws(()=>validateContentUpload('hello.md','text/markdown',new Uint8Array([0xff,0xfe])),/UTF-8/);
 assert.throws(()=>validateContentUpload('large.txt','text/plain',new Uint8Array(TEXT_MAX_BYTES+1)),/256 KiB or smaller/);
 assert.throws(()=>validateContentUpload('hello.svg','image/svg+xml',bytes),/Choose a PNG/);
});

test('local persistent activity upsert is idempotent, filterable, paginated, and survives store rereads',async()=>{
 const record=(tx:string,block:string,loom:string):ActivityRecord=>({chainId:10143,hubAddress:'0x'+'1'.repeat(40),transactionHash:`0x${tx.repeat(64)}`,blockNumber:block,blockHash:'0x'+'2'.repeat(64),logIndex:0,eventType:'LoomCreated',walletAddress:'0x'+'3'.repeat(40),loomId:loom,postId:null,amountWei:null,allocation:null,args:{loomId:loom,curator:'0x'+'3'.repeat(40),name:`Loom ${loom}`},confirmed:true,observedAt:new Date(0).toISOString()});
 const a=record('a','10','1'),b=record('b','11','2');assert.equal(await upsertActivity([a,b]),2);assert.equal(await upsertActivity([a,b]),0);
 assert.deepEqual((await listActivity({limit:1,offset:0})).map(item=>item.transactionHash),[b.transactionHash]);assert.deepEqual((await listActivity({limit:10,offset:0,loomId:'1'})).map(item=>item.loomId),['1']);
 const cursor={blockNumber:'11',blockHash:'0x'+'4'.repeat(64),polledAt:123};await writeCursor(10143,a.hubAddress,cursor);assert.deepEqual(await readCursor(10143,a.hubAddress),cursor);assert.equal(configuredDriver(),'local');
});

test('Pinata content mode keeps activity on local disk and does not require Supabase or Pinata credentials for reads',async()=>{
 const previousDriver=process.env.ECHOLOOM_STORAGE_DRIVER;const previousJwt=process.env.PINATA_JWT;process.env.ECHOLOOM_STORAGE_DRIVER='pinata';delete process.env.PINATA_JWT;
 try{
  const record:ActivityRecord={chainId:10143,hubAddress:'0x'+'1'.repeat(40),transactionHash:'0x'+'c'.repeat(64),blockNumber:'42',blockHash:'0x'+'2'.repeat(64),logIndex:0,eventType:'LoomCreated',walletAddress:null,loomId:'1',postId:null,amountWei:null,allocation:null,args:{loomId:'1',name:'Local activity'},confirmed:true,observedAt:new Date(0).toISOString()};
  assert.equal(await upsertActivity([record]),1);assert.ok((await listActivity({limit:10,offset:0})).some(item=>item.transactionHash===record.transactionHash));
  const cursor={blockNumber:'42',blockHash:record.blockHash,polledAt:42};await writeCursor(10143,record.hubAddress,cursor);assert.deepEqual(await readCursor(10143,record.hubAddress),cursor);
 }finally{if(previousDriver===undefined)delete process.env.ECHOLOOM_STORAGE_DRIVER;else process.env.ECHOLOOM_STORAGE_DRIVER=previousDriver;if(previousJwt===undefined)delete process.env.PINATA_JWT;else process.env.PINATA_JWT=previousJwt;}
});

test('content and metadata are persisted on disk and load by digest after a second read',async()=>{
 const bytes=new TextEncoder().encode('persistent upload');const mediaType='text/plain';const digest=await sha256ContentHash(mediaType,bytes);const metadata={version:1 as const,sha256:digest,mediaType,size:bytes.byteLength,algorithm:'SHA-256(EchoLoomContent:v1 envelope)',storedAt:new Date(0).toISOString()};
 await saveContent(digest.slice(2),bytes,metadata);await saveContent(digest.slice(2),bytes,metadata);const loaded=await loadContent(digest.slice(2));assert.ok(loaded);assert.equal(new TextDecoder().decode(loaded.bytes),'persistent upload');assert.deepEqual(loaded.metadata,metadata);
});

test('content references reject localhost and malformed IPFS references while accepting public HTTPS and CID forms',()=>{
 assert.equal(isPublishableContentReference('http://localhost:3000/api/content/abc'),false);
 assert.equal(isPublishableContentReference('https://localhost/content'),false);
 assert.equal(isPublishableContentReference('https://192.168.1.4/file'),false);
 assert.equal(isPublishableContentReference('https://example.org/content'),true);
 assert.equal(isPublishableContentReference(`ipfs://${testCid()}`),true);
 assert.equal(isPublishableContentReference('ipfs://not-a-cid'),false);
});

test('Pinata upload validates returned CID and preserves content hash metadata without returning credentials',async()=>{
 const oldFetch=globalThis.fetch;const oldPinata=process.env.PINATA_JWT;const bytes=new TextEncoder().encode('pinata test payload');const digest=await sha256ContentHash('text/plain',bytes);const cid=testCid();
 process.env.PINATA_JWT='test-only-token';process.env.ECHOLOOM_STORAGE_DRIVER='pinata';
 try{
  let received:FormData|undefined;
  globalThis.fetch=async(input,init)=>{if(String(input).includes('gateway.pinata.cloud'))return new Response(bytes,{status:200});assert.equal(String(input),'https://uploads.pinata.cloud/v3/files');received=init?.body as FormData;return new Response(JSON.stringify({data:{cid}}),{status:200,headers:{'Content-Type':'application/json'}});};
  const {saveContent,configuredDriver}=await import('../src/lib/server/persistence.ts');
  const meta={version:1 as const,sha256:digest,mediaType:'text/plain',size:bytes.length,algorithm:'SHA-256(EchoLoomContent:v1 envelope)',storedAt:new Date(0).toISOString()};
  assert.equal(await saveContent(digest.slice(2),bytes,meta),cid);assert.equal(configuredDriver(),'pinata');
  const fields=JSON.parse(String(received?.get('keyvalues')));assert.equal(fields.sha256,digest);assert.equal(fields.mediaType,meta.mediaType);assert.equal(fields.size,String(bytes.length));assert.equal(received?.get('network'),'public');assert.equal(received?.get('name'),`echoloom-${digest.slice(2)}`);
  const file=received?.get('file') as File;assert.equal(file.type,'text/plain');assert.equal(new TextDecoder().decode(await file.arrayBuffer()),'pinata test payload');
  assert.equal(isPublishableContentReference(`ipfs://${cid}`),true);
 }finally{globalThis.fetch=oldFetch;if(oldPinata===undefined)delete process.env.PINATA_JWT;else process.env.PINATA_JWT=oldPinata;process.env.ECHOLOOM_STORAGE_DRIVER='local';}
});

test('Pinata provider errors and malformed CIDs fail closed',async()=>{
 const oldFetch=globalThis.fetch;const oldPinata=process.env.PINATA_JWT;process.env.PINATA_JWT='test-only-token';process.env.ECHOLOOM_STORAGE_DRIVER='pinata';
 try{
  const {saveContent}=await import('../src/lib/server/persistence.ts');const bytes=new TextEncoder().encode('failure');const digest=await sha256ContentHash('text/plain',bytes);const meta={version:1 as const,sha256:digest,mediaType:'text/plain',size:bytes.length,algorithm:'test',storedAt:new Date(0).toISOString()};
  globalThis.fetch=async()=>new Response('no',{status:401});await assert.rejects(()=>saveContent(digest.slice(2),bytes,meta),/rejected the upload \(401\)/);
  globalThis.fetch=async()=>new Response(JSON.stringify({data:{cid:'bad-cid'}}),{status:200});await assert.rejects(()=>saveContent(digest.slice(2),bytes,meta),/malformed content identifier/);
  let calls=0;globalThis.fetch=async()=>{calls++;return calls===1?new Response(JSON.stringify({data:{cid:testCid()}}),{status:200}):new Response('not the uploaded bytes',{status:200});};await assert.rejects(()=>saveContent(digest.slice(2),bytes,meta),/did not match the uploaded file/);
 }finally{globalThis.fetch=oldFetch;if(oldPinata===undefined)delete process.env.PINATA_JWT;else process.env.PINATA_JWT=oldPinata;process.env.ECHOLOOM_STORAGE_DRIVER='local';}
});

