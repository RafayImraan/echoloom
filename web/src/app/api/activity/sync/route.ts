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

function safeDiagnostic(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth += 1) {
    const item = current as { name?: unknown; message?: unknown; code?: unknown; status?: unknown; cause?: unknown };
    const name = typeof item.name === 'string' ? item.name : 'Error';
    const message = typeof item.message === 'string' ? item.message : '';
    const code = typeof item.code === 'string' || typeof item.code === 'number' ? ` [${item.code}]` : '';
    const status = typeof item.status === 'number' ? ` HTTP ${item.status}` : '';
    if (message) parts.push(`${name}${code}${status}: ${message}`);
    current = item.cause;
  }
  return (parts.join(' <- ').replace(/https:\/\/monad-testnet\.g\.alchemy\.com\/v2\/[^\s/]+/gi, '[Alchemy RPC URL]').slice(0, 600) || 'No RPC error details available.');
}

export async function POST(request: Request){
 try{return NextResponse.json({ok:true,...await syncConfirmedHubActivity()},{headers:{'Cache-Control':'no-store'}});}
 catch(error){return NextResponse.json({ok:false,error:safeMessage(error),...(request.headers.get('x-debug-rpc')==='1'?{diagnostic:safeDiagnostic(error)}:{})},{status:503,headers:{'Cache-Control':'no-store'}});}
}
