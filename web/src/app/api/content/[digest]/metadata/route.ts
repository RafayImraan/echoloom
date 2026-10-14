import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { canonicalContentBytes } from '../../../../../lib/content-hash';
import { loadContent } from '../../../../../lib/server/persistence';

export const runtime='nodejs';export const dynamic='force-dynamic';
type Context={params:Promise<{digest:string}>};
export async function GET(_request:Request,{params}:Context){
 try{const {digest}=await params;if(!/^[0-9a-fA-F]{64}$/.test(digest))return NextResponse.json({error:'Invalid content reference.'},{status:400});const item=await loadContent(digest.toLowerCase());if(!item)return NextResponse.json({error:'Content was not found.'},{status:404});const actual=`0x${createHash('sha256').update(canonicalContentBytes(item.metadata.mediaType,item.bytes)).digest('hex')}`;if(actual!==item.metadata.sha256||actual.slice(2)!==digest.toLowerCase())return NextResponse.json({error:'Stored content failed its SHA-256 integrity check.'},{status:503});return NextResponse.json(item.metadata,{headers:{'Cache-Control':'public, max-age=31536000, immutable'}});}
 catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Content metadata is unavailable.'},{status:503});}
}
