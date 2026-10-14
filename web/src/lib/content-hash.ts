export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const TEXT_MAX_BYTES = 256 * 1024;

/** Canonical SHA-256 input: UTF-8 domain, MIME type, byte length, then exact file bytes. */
export function canonicalContentBytes(mediaType: string, bytes: Uint8Array): Uint8Array {
  const prefix = new TextEncoder().encode(`echoloom-content-v1\n${mediaType}\n${bytes.byteLength}\n`);
  const input = new Uint8Array(prefix.byteLength + bytes.byteLength);
  input.set(prefix, 0);
  input.set(bytes, prefix.byteLength);
  return input;
}

export async function sha256ContentHash(mediaType: string, bytes: Uint8Array): Promise<`0x${string}`> {
  const input = canonicalContentBytes(mediaType, bytes);
  const buffer = new ArrayBuffer(input.byteLength);
  new Uint8Array(buffer).set(input);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
  return `0x${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}
