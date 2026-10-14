import { NextResponse } from 'next/server';
import { syncConfirmedHubActivity } from '../../../../lib/server/hub-events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/eth_getLogs|HTTP request failed|Request body:/i.test(message) || message.length > 240) {
    return 'Monad Testnet RPC could not return confirmed activity. Check the RPC endpoint and retry.';
  }
  return message || 'Unable to synchronize Monad Testnet activity.';
}

export async function POST(){
 try{return NextResponse.json({ok:true,...await syncConfirmedHubActivity()},{headers:{'Cache-Control':'no-store'}});}
 catch(error){return NextResponse.json({ok:false,error:safeMessage(error)},{status:503,headers:{'Cache-Control':'no-store'}});}
}
