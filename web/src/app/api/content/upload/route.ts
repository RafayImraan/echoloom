import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { canonicalContentBytes, IMAGE_MAX_BYTES } from '../../../../lib/content-hash';
import { validateContentUpload } from '../../../../lib/server/upload-validation';
import { configuredDriver, isValidIpfsCid, publicContentUrl, saveContent, type StoredContentMetadata } from '../../../../lib/server/persistence';

export const runtime='nodejs';export const dynamic='force-dynamic';
const MAX_MULTIPART_BYTES=IMAGE_MAX_BYTES+128*1024;

export async function POST(request:NextRequest){
 try{
  const declaredLength=Number(request.headers.get('content-length')||0);if(declaredLength>MAX_MULTIPART_BYTES)return NextResponse.json({error:'Upload request exceeds the 5 MiB file limit.'},{status:413});
  const form=await request.formData();const file=form.get('file');const expected=form.get('sha256');
  if(!(file instanceof File)||typeof expected!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(expected))return NextResponse.json({error:'A file and client-computed SHA-256 digest are required.'},{status:400});
  if(file.name.length>255||/[\\/\u0000-\u001f]/.test(file.name))return NextResponse.json({error:'File name is invalid.'},{status:400});
  const bytes=new Uint8Array(await file.arrayBuffer());const validated=validateContentUpload(file.name,file.type,bytes);
  const actual=`0x${createHash('sha256').update(canonicalContentBytes(validated.mediaType,bytes)).digest('hex')}`;
  if(actual.toLowerCase()!==expected.toLowerCase())return NextResponse.json({error:'Server SHA-256 did not match the submitted digest; content was not stored.'},{status:422});
  const metadata:StoredContentMetadata={version:1,sha256:actual,mediaType:validated.mediaType,size:validated.size,algorithm:'SHA-256(EchoLoomContent:v1 envelope)',storedAt:new Date().toISOString()};
  const cid=await saveContent(actual.slice(2),bytes,metadata);
  const driver=configuredDriver();
  const reference=cid?`ipfs://${cid}`:publicContentUrl(actual.slice(2),request.nextUrl.origin);
  if(cid&&!isValidIpfsCid(reference.slice('ipfs://'.length)))throw new Error('IPFS provider returned a malformed content reference.');
  return NextResponse.json({reference,contentHash:actual,mediaType:validated.mediaType,size:validated.size,algorithm:metadata.algorithm,stored:true,publishable:driver!=='local',storage:driver==='pinata'?'ipfs':driver},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Content upload failed; no successful upload is reported.'},{status:400,headers:{'Cache-Control':'no-store'}});}
}
