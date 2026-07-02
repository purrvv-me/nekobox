// AES-256-GCM primitives for small values (keys, metadata).
// For file bodies use the streaming API in ./stream.

import { bs, concatBytes, fromBase64, randomBytes, toBase64 } from "./codec";

/** A self-describing ciphertext: base64 ciphertext + base64 12-byte IV. */
export interface Sealed {
  ct: string;
  iv: string;
}

/** Generate a fresh extractable AES-256-GCM key (e.g. a data key / master key). */
export async function generateAesKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
    "wrapKey",
    "unwrapKey",
  ]);
}

/** Import 32 raw bytes as an AES-256-GCM key. */
export async function importAesKey(raw: Uint8Array, extractable = false): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", bs(raw), { name: "AES-GCM" }, extractable, [
    "encrypt",
    "decrypt",
  ]);
}

/** Encrypt bytes; a random 96-bit IV is generated and returned. */
export async function seal(
  key: CryptoKey,
  plaintext: Uint8Array,
  aad?: Uint8Array,
): Promise<Sealed> {
  const iv = randomBytes(12);
  const params: AesGcmParams = { name: "AES-GCM", iv };
  if (aad) params.additionalData = bs(aad);
  const ct = await crypto.subtle.encrypt(params, key, bs(plaintext));
  return { ct: toBase64(ct), iv: toBase64(iv) };
}

/** Decrypt a {ct, iv} pair. Throws if the key is wrong or data was tampered. */
export async function open(
  key: CryptoKey,
  sealed: Sealed,
  aad?: Uint8Array,
): Promise<Uint8Array<ArrayBuffer>> {
  const params: AesGcmParams = { name: "AES-GCM", iv: fromBase64(sealed.iv) };
  if (aad) params.additionalData = bs(aad);
  const pt = await crypto.subtle.decrypt(params, key, fromBase64(sealed.ct));
  return new Uint8Array(pt);
}

/** Wrap (encrypt) a CryptoKey's raw bytes under a KEK. */
export async function wrapKey(kek: CryptoKey, key: CryptoKey): Promise<Sealed> {
  const iv = randomBytes(12);
  const wrapped = await crypto.subtle.wrapKey("raw", key, kek, { name: "AES-GCM", iv });
  return { ct: toBase64(wrapped), iv: toBase64(iv) };
}

/** Unwrap a key wrapped with {@link wrapKey} back into an AES-256-GCM key. */
export async function unwrapKey(
  kek: CryptoKey,
  sealed: Sealed,
  extractable = true,
): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    "raw",
    fromBase64(sealed.ct),
    kek,
    { name: "AES-GCM", iv: fromBase64(sealed.iv) },
    { name: "AES-GCM" },
    extractable,
    ["encrypt", "decrypt", "wrapKey", "unwrapKey"],
  );
}

// Re-export for callers that build AAD from multiple parts.
export { concatBytes };
