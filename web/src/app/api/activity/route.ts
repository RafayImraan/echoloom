import { NextRequest, NextResponse } from 'next/server';
import { isAddress } from 'viem';
import { listActivity } from '../../../lib/server/persistence';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request:NextRequest){
 try{
  const params=request.nextUrl.searchParams;const limitRaw=params.get('limit')||'50';const offsetRaw=params.get('offset')||'0';
  if(!/^\d+$/.test(limitRaw)||!/^\d+$/.test(offsetRaw))return NextResponse.json({error:'limit and offset must be non-negative integers.'},{status:400});
  const limit=Number(limitRaw),offset=Number(offsetRaw);if(limit<1||limit>100||offset>50000)return NextResponse.json({error:'limit must be 1-100 and offset cannot exceed 50000.'},{status:400});
  const wallet=params.get('wallet')||undefined;if(wallet&&!isAddress(wallet))return NextResponse.json({error:'wallet must be a valid EVM address.'},{status:400});
  const loomId=params.get('loomId')||undefined;if(loomId&&!/^\d{1,78}$/.test(loomId))return NextResponse.json({error:'loomId must be a non-negative integer.'},{status:400});
  const events=await listActivity({limit,offset,wallet,loomId});return NextResponse.json({events,limit,offset,nextOffset:events.length===limit?offset+limit:null},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Persistent activity storage is unavailable.'},{status:503});}
}
