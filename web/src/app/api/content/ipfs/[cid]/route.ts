import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { canonicalContentBytes, IMAGE_MAX_BYTES, TEXT_MAX_BYTES } from '../../../../../lib/content-hash';
import { isValidIpfsCid } from '../../../../../lib/server/persistence';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'text/plain', 'text/markdown'] as const;
const MAX_CONTENT_BYTES = IMAGE_MAX_BYTES;

async function readBounded(response: Response): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > MAX_CONTENT_BYTES) throw new Error('Content exceeds the display size limit.');
  if (!response.body) throw new Error('IPFS gateway returned no content.');
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    total += value.byteLength;
    if (total > MAX_CONTENT_BYTES) { await reader.cancel(); throw new Error('Content exceeds the display size limit.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export async function GET(request: NextRequest, context: { params: Promise<{ cid: string }> }) {
  try {
    const { cid } = await context.params; const expectedHash = request.nextUrl.searchParams.get('hash') || '';
    if (!isValidIpfsCid(cid) || !/^0x[0-9a-fA-F]{64}$/.test(expectedHash)) return NextResponse.json({ error: 'Invalid IPFS reference.' }, { status: 400 });
    const upstream = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`, { signal: AbortSignal.timeout(15_000), cache: 'no-store', redirect: 'error' });
    if (!upstream.ok) return NextResponse.json({ error: 'IPFS content is not available from the gateway yet.' }, { status: 502 });
    const bytes = await readBounded(upstream);
    let matchedType: string | undefined;
    for (const mediaType of MEDIA_TYPES) {
      if (bytes.byteLength > (mediaType.startsWith('text/') ? TEXT_MAX_BYTES : IMAGE_MAX_BYTES)) continue;
      const actual = `0x${createHash('sha256').update(canonicalContentBytes(mediaType, bytes)).digest('hex')}`;
      if (actual.toLowerCase() === expectedHash.toLowerCase()) { matchedType = mediaType; break; }
    }
    if (!matchedType) return NextResponse.json({ error: 'IPFS content does not match the on-chain content hash.' }, { status: 422 });
    const body = new ArrayBuffer(bytes.byteLength); new Uint8Array(body).set(bytes);
    return new NextResponse(body, { headers: { 'Content-Type': matchedType, 'Content-Length': String(bytes.byteLength), 'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=300', 'X-EchoLoom-Hash-Verified': 'true' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = /size limit/i.test(message) ? 413 : 502;
    return NextResponse.json({ error: status === 413 ? message : 'IPFS content could not be loaded or verified.' }, { status });
  }
}
