// NekoBox client-side cryptography (runs ONLY in the browser).
//
// Threat model: the server is honest-but-curious. It stores ciphertext and
// public/ wrapped key material but must never be able to read file contents
// or derive any user's keys.
//
// Key hierarchy
//   password ──PBKDF2(SHA-256, 200k, per-user salt)──▶ MK  (AES-256-GCM "master key")
//   MK wraps:  the user's RSA private key            (for sharing)
//   MK wraps:  each file's random DEK                (AES-256-GCM)
//   DEK encrypts the file body.
//   Sharing:   DEK is re-wrapped with the recipient's RSA *public* key.
//
// Nothing in this file ever transmits MK, the RSA private key, or a DEK in
// the clear.

const PBKDF2_ITERATIONS = 200_000;
const enc = new TextEncoder();
const dec = new TextDecoder();

// ─── base64 helpers (binary-safe) ─────────────────────────────────────
export function bufToB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function b64ToBuf(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function randomBytes(len: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(len));
}

export function newSaltB64(): string {
  return bufToB64(randomBytes(16));
}

function newIv(): Uint8Array<ArrayBuffer> {
  return randomBytes(12); // 96-bit nonce for AES-GCM
}

// ─── Master key derivation (PBKDF2) ───────────────────────────────────
export async function deriveMasterKey(password: string, saltB64: string): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: b64ToBuf(saltB64),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false, // MK is non-extractable — it never leaves the browser as raw bytes
    ["encrypt", "decrypt", "wrapKey", "unwrapKey"],
  );
}

// ─── KEK / VMK key hierarchy ──────────────────────────────────────────
// PWK (password key) = PBKDF2(password) — used only to wrap/unwrap the VMK.
// Identical derivation to deriveMasterKey; aliased for clarity.
export const deriveKEK = deriveMasterKey;

// VMK = the long-lived vault master key. Extractable so it can be re-wrapped
// when the password changes, and wrapped under a recovery key.
export async function generateVmk(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
    "wrapKey",
    "unwrapKey",
  ]);
}

export async function wrapVmk(kek: CryptoKey, vmk: CryptoKey): Promise<Sealed> {
  const iv = newIv();
  const wrapped = await crypto.subtle.wrapKey("raw", vmk, kek, { name: "AES-GCM", iv });
  return { ciphertext: bufToB64(wrapped), iv: bufToB64(iv) };
}

export async function unwrapVmk(kek: CryptoKey, sealed: Sealed): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    "raw",
    b64ToBuf(sealed.ciphertext),
    kek,
    { name: "AES-GCM", iv: b64ToBuf(sealed.iv) },
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt", "wrapKey", "unwrapKey"],
  );
}

// ─── Recovery code (high-entropy, shown once) ─────────────────────────
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; // RFC 4648 base32

export function generateRecoveryCode(): string {
  const bytes = randomBytes(20); // 160 bits of entropy
  let bits = 0;
  let value = 0;
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out.match(/.{1,5}/g)!.join("-"); // e.g. ABCDE-FGHIJ-...
}

export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z2-7]/g, "");
}

export async function deriveRecoveryKey(code: string, saltB64: string): Promise<CryptoKey> {
  return deriveMasterKey(normalizeRecoveryCode(code), saltB64);
}

// ─── Generic AES-GCM encrypt/decrypt ──────────────────────────────────
export interface Sealed {
  ciphertext: string; // base64
  iv: string; // base64
}

export async function aesEncryptBytes(key: CryptoKey, data: BufferSource): Promise<Sealed> {
  const iv = newIv();
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  return { ciphertext: bufToB64(ct), iv: bufToB64(iv) };
}

export async function aesDecryptBytes(key: CryptoKey, sealed: Sealed): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64ToBuf(sealed.iv) },
    key,
    b64ToBuf(sealed.ciphertext),
  );
}

export async function aesEncryptString(key: CryptoKey, text: string): Promise<Sealed> {
  return aesEncryptBytes(key, enc.encode(text));
}

export async function aesDecryptString(key: CryptoKey, sealed: Sealed): Promise<string> {
  return dec.decode(await aesDecryptBytes(key, sealed));
}

// ─── RSA keypair for sharing ──────────────────────────────────────────
export interface WrappedKeypair {
  publicKey: string; // SPKI, base64
  encPrivateKey: string; // PKCS8 ciphertext, base64
  encPrivateKeyIv: string; // base64
}

/** Generate an RSA-OAEP keypair and wrap the private key under MK. */
export async function generateWrappedKeypair(masterKey: CryptoKey): Promise<WrappedKeypair> {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["wrapKey", "unwrapKey"],
  );
  const spki = await crypto.subtle.exportKey("spki", pair.publicKey);
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
  const sealed = await aesEncryptBytes(masterKey, pkcs8);
  return {
    publicKey: bufToB64(spki),
    encPrivateKey: sealed.ciphertext,
    encPrivateKeyIv: sealed.iv,
  };
}

/** Recover the RSA private key by unwrapping it with MK. */
export async function importPrivateKey(
  masterKey: CryptoKey,
  encPrivateKey: string,
  encPrivateKeyIv: string,
): Promise<CryptoKey> {
  const pkcs8 = await aesDecryptBytes(masterKey, {
    ciphertext: encPrivateKey,
    iv: encPrivateKeyIv,
  });
  return crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["unwrapKey"],
  );
}

export async function importPublicKey(spkiB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "spki",
    b64ToBuf(spkiB64),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["wrapKey"],
  );
}

// ─── Per-file DEK lifecycle ───────────────────────────────────────────
export async function generateDek(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

/** Wrap a DEK under the owner's master key (symmetric). */
export async function wrapDekWithMaster(masterKey: CryptoKey, dek: CryptoKey): Promise<Sealed> {
  const iv = newIv();
  const wrapped = await crypto.subtle.wrapKey("raw", dek, masterKey, {
    name: "AES-GCM",
    iv,
  });
  return { ciphertext: bufToB64(wrapped), iv: bufToB64(iv) };
}

export async function unwrapDekWithMaster(masterKey: CryptoKey, sealed: Sealed): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    "raw",
    b64ToBuf(sealed.ciphertext),
    masterKey,
    { name: "AES-GCM", iv: b64ToBuf(sealed.iv) },
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

/** Wrap a DEK with a recipient's RSA public key (for sharing). */
export async function wrapDekForRecipient(publicKey: CryptoKey, dek: CryptoKey): Promise<string> {
  const wrapped = await crypto.subtle.wrapKey("raw", dek, publicKey, { name: "RSA-OAEP" });
  return bufToB64(wrapped);
}

/** Unwrap a shared DEK with our RSA private key. */
export async function unwrapDekFromSender(
  privateKey: CryptoKey,
  rsaWrappedDekB64: string,
): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    "raw",
    b64ToBuf(rsaWrappedDekB64),
    privateKey,
    { name: "RSA-OAEP" },
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

// ─── File body encryption ─────────────────────────────────────────────
export async function encryptFileBody(
  dek: CryptoKey,
  data: ArrayBuffer,
): Promise<{ blob: Blob; iv: string }> {
  const iv = newIv();
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, dek, data);
  return { blob: new Blob([ct], { type: "application/octet-stream" }), iv: bufToB64(iv) };
}

export async function decryptFileBody(
  dek: CryptoKey,
  ciphertext: ArrayBuffer,
  ivB64: string,
): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBuf(ivB64) }, dek, ciphertext);
}

// ─── Chunked file encryption (for large files) ────────────────────────
// The body is split into fixed-size plaintext chunks, each AES-GCM-encrypted
// under the DEK with IV = baseNonce(8 bytes) || uint32be(chunkIndex). This caps
// peak memory and lets each chunk be verified independently.
export const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MiB plaintext per chunk
const GCM_TAG = 16;

function chunkIv(base: Uint8Array, index: number): Uint8Array<ArrayBuffer> {
  const iv = new Uint8Array(12);
  iv.set(base.subarray(0, 8), 0);
  new DataView(iv.buffer).setUint32(8, index, false); // big-endian counter
  return iv;
}

export async function encryptFileChunked(
  dek: CryptoKey,
  data: ArrayBuffer,
  chunkSize: number = CHUNK_SIZE,
): Promise<{ blob: Blob; contentIv: string; chunkSize: number }> {
  const base = randomBytes(8);
  const bytes = new Uint8Array(data);
  const parts: ArrayBuffer[] = [];
  const n = Math.max(1, Math.ceil(bytes.length / chunkSize));
  for (let i = 0; i < n; i++) {
    const slice = bytes.subarray(i * chunkSize, Math.min((i + 1) * chunkSize, bytes.length));
    parts.push(await crypto.subtle.encrypt({ name: "AES-GCM", iv: chunkIv(base, i) }, dek, slice));
  }
  return {
    blob: new Blob(parts, { type: "application/octet-stream" }),
    contentIv: bufToB64(base),
    chunkSize,
  };
}

export async function decryptFileChunked(
  dek: CryptoKey,
  ciphertext: ArrayBuffer,
  contentIvB64: string,
  chunkSize: number,
): Promise<ArrayBuffer> {
  const base = b64ToBuf(contentIvB64);
  const ct = new Uint8Array(ciphertext);
  const encChunk = chunkSize + GCM_TAG;
  const out: Uint8Array[] = [];
  let index = 0;
  for (let off = 0; off < ct.length; off += encChunk, index++) {
    const slice = ct.subarray(off, Math.min(off + encChunk, ct.length));
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: chunkIv(base, index) }, dek, slice);
    out.push(new Uint8Array(pt));
  }
  const total = out.reduce((a, c) => a + c.length, 0);
  const res = new Uint8Array(total);
  let p = 0;
  for (const c of out) {
    res.set(c, p);
    p += c.length;
  }
  return res.buffer;
}
