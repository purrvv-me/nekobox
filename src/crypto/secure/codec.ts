// Byte / base64 utilities and CSPRNG helpers.
// Self-contained: relies only on the Web Crypto global (browser & Node 20+).

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Cryptographically secure random bytes. */
export function randomBytes(len: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(len));
}

/** A fresh random salt (default 16 bytes), base64-encoded. */
export function randomSaltB64(len = 16): string {
  return toBase64(randomBytes(len));
}

export function utf8(text: string): Uint8Array<ArrayBuffer> {
  // Uint8Array.from normalises the backing buffer to a plain ArrayBuffer,
  // which keeps TypeScript's BufferSource typing happy for Web Crypto calls.
  return Uint8Array.from(encoder.encode(text));
}

export function fromUtf8(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

export function toBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Concatenate byte arrays into a single ArrayBuffer-backed Uint8Array. */
export function concatBytes(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** 32-bit unsigned integer as 4 big-endian bytes. */
export function uint32BE(n: number): Uint8Array<ArrayBuffer> {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, false);
  return b;
}

/**
 * Coerce a Uint8Array to BufferSource for Web Crypto calls. Under TS 5.7+ a
 * bare `Uint8Array` is `Uint8Array<ArrayBufferLike>`, which the DOM lib rejects
 * as BufferSource; at runtime these are always plain ArrayBuffer-backed views.
 */
export function bs(u: Uint8Array): BufferSource {
  return u as unknown as BufferSource;
}

/** Constant-time comparison of two byte arrays. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
