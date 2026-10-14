export function isPublishableContentReference(reference: string): boolean {
  if (new TextEncoder().encode(reference).byteLength > 512 || /\s/.test(reference)) return false;
  if (/^ipfs:\/\//i.test(reference)) {
    const cid = reference.slice(7);
    return isValidIpfsCid(cid);
  }
  try {
    const url = new URL(reference);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.localhost')) return false;
    if (/^(127\.|10\.|192\.168\.|169\.254\.)/.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
    return true;
  } catch { return false; }
}

function decodeBase32Cid(value: string): number[] | null {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let accumulator = 0, bits = 0;
  const bytes: number[] = [];
  for (const char of value) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) return null;
    accumulator = (accumulator << 5) | digit;
    bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push((accumulator >> bits) & 255); }
    accumulator &= (1 << bits) - 1;
  }
  if (bits > 0 && accumulator !== 0) return null;
  return bytes;
}

function decodeBase58(value: string): number[] | null {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let number = 0n;
  for (const char of value) { const digit = alphabet.indexOf(char); if (digit < 0) return null; number = number * 58n + BigInt(digit); }
  const bytes: number[] = [];
  while (number > 0n) { bytes.unshift(Number(number & 255n)); number >>= 8n; }
  for (const char of value) { if (char !== '1') break; bytes.unshift(0); }
  return bytes;
}

function readVarint(bytes: number[], start: number): { value: number; next: number } | null {
  let value = 0, shift = 0;
  for (let index = start; index < bytes.length && shift <= 49; index++, shift += 7) {
    const byte = bytes[index];
    value += (byte & 127) * 2 ** shift;
    if ((byte & 128) === 0) return Number.isSafeInteger(value) ? { value, next: index + 1 } : null;
  }
  return null;
}

export function isValidIpfsCid(cid: string): boolean {
  if (cid.startsWith('b')) {
    const bytes = decodeBase32Cid(cid.slice(1));
    if (!bytes) return false;
    const version = readVarint(bytes, 0);
    if (!version || version.value !== 1) return false;
    const codec = readVarint(bytes, version.next);
    if (!codec || codec.value === 0) return false;
    const hashCode = readVarint(bytes, codec.next);
    if (!hashCode || hashCode.value === 0) return false;
    const digestLength = readVarint(bytes, hashCode.next);
    return !!digestLength && digestLength.value > 0 && digestLength.next + digestLength.value === bytes.length;
  }
  if (!cid.startsWith('Qm')) return false;
  const bytes = decodeBase58(cid);
  return cid.length === 46 && !!bytes && bytes.length === 34 && bytes[0] === 0x12 && bytes[1] === 0x20;
}
