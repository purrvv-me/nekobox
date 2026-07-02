// NekoBox main-app crypto — a thin ADAPTER over the Stage-1 module
// (src/crypto/secure), which is the single source of truth for all
// cryptography. This file contains no crypto of its own: it only maps the
// app's historical API shape ({ciphertext, iv} fields, flat keypair fields,
// legacy chunk signatures) onto the Stage-1 primitives.
//
// Key hierarchy (unchanged):
//   password ──PBKDF2(SHA-256, per-user iterations, salt)──▶ PWK ──wraps──▶ VMK
//   recovery code ──PBKDF2(…, recoverySalt)────────────────▶ RWK ──wraps──▶ VMK
//   VMK wraps: the RSA private key (sharing), each file's DEK, all names.
//   File bodies use the Stage-1 chunked stream format (NBX1 header; per-chunk
//   IV = baseNonce‖index and AAD = header‖index‖finalFlag, so truncation and
//   reordering are detected).

import {
  seal,
  open,
  generateAesKey,
  wrapKey,
  unwrapKey,
  type Sealed as SecureSealed,
} from "./secure/aes";
import { deriveKeyPBKDF2, DEFAULT_PBKDF2 } from "./secure/kdf";
import { encryptBytes, decryptBytes, DEFAULT_CHUNK_SIZE } from "./secure/stream";
import {
  generateRecoveryCode as secureGenerateRecoveryCode,
  normalizeRecoveryCode as secureNormalizeRecoveryCode,
} from "./secure/recovery";
import { importAesKey } from "./secure/aes";
import { toBase64, fromBase64, randomBytes, randomSaltB64, utf8, fromUtf8 } from "./secure/codec";

// ─── base64 helpers (historical names) ────────────────────────────────
export const bufToB64 = toBase64;
export const b64ToBuf = fromBase64;
export const newSaltB64 = randomSaltB64;

// ─── Sealed shape adaptation ──────────────────────────────────────────
// The app/API/DB speak {ciphertext, iv}; Stage-1 speaks {ct, iv}.
export interface Sealed {
  ciphertext: string;
  iv: string;
}
const toSecure = (s: Sealed): SecureSealed => ({ ct: s.ciphertext, iv: s.iv });
const fromSecure = (s: SecureSealed): Sealed => ({ ciphertext: s.ct, iv: s.iv });

// ─── Master key derivation (PBKDF2) ───────────────────────────────────
export const DEFAULT_PBKDF2_ITERATIONS = DEFAULT_PBKDF2.iterations; // 600k

export async function deriveMasterKey(
  password: string,
  saltB64: string,
  iterations: number = DEFAULT_PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  return deriveKeyPBKDF2(password, saltB64, { name: "PBKDF2", hash: "SHA-256", iterations });
}

// PWK (password key) — used only to wrap/unwrap the VMK.
export const deriveKEK = deriveMasterKey;

// ─── KEK / VMK hierarchy ──────────────────────────────────────────────
export async function generateVmk(): Promise<CryptoKey> {
  return generateAesKey();
}

export async function wrapVmk(kek: CryptoKey, vmk: CryptoKey): Promise<Sealed> {
  return fromSecure(await wrapKey(kek, vmk));
}

export async function unwrapVmk(kek: CryptoKey, sealed: Sealed): Promise<CryptoKey> {
  return unwrapKey(kek, toSecure(sealed), /* extractable (re-wrap on pw change) */ true);
}

// ─── Recovery code ────────────────────────────────────────────────────
export const generateRecoveryCode = secureGenerateRecoveryCode;
export const normalizeRecoveryCode = secureNormalizeRecoveryCode;

// The recovery code carries 160 bits of entropy, so a lower fixed PBKDF2 cost
// is sufficient — and keeping it FIXED lets the password KDF cost rise
// independently without breaking existing recovery codes.
const RECOVERY_PBKDF2_ITERATIONS = 200_000;

export async function deriveRecoveryKey(code: string, saltB64: string): Promise<CryptoKey> {
  return deriveMasterKey(normalizeRecoveryCode(code), saltB64, RECOVERY_PBKDF2_ITERATIONS);
}

// ─── AES string helpers (names, small metadata) ───────────────────────
export async function aesEncryptString(key: CryptoKey, text: string): Promise<Sealed> {
  return fromSecure(await seal(key, utf8(text)));
}

export async function aesDecryptString(key: CryptoKey, sealed: Sealed): Promise<string> {
  return fromUtf8(await open(key, toSecure(sealed)));
}

// ─── Per-file DEK lifecycle ───────────────────────────────────────────
export async function generateDek(): Promise<CryptoKey> {
  return generateAesKey();
}

export async function wrapDekWithMaster(masterKey: CryptoKey, dek: CryptoKey): Promise<Sealed> {
  return fromSecure(await wrapKey(masterKey, dek));
}

export async function unwrapDekWithMaster(masterKey: CryptoKey, sealed: Sealed): Promise<CryptoKey> {
  return unwrapKey(masterKey, toSecure(sealed), true);
}

// ─── Optional email recovery (ERK) ────────────────────────────────────
// A random Email Recovery Key wraps the VMK. The ERK is handed to the server
// (documented ZK trade-off): the server releases it only after the user proves
// control of the linked mailbox via a signed, single-use ticket. The email
// itself never decrypts anything directly.

export interface EmailRecoveryMaterial {
  erk: string; // base64 raw key — server-held
  emailWrappedVmk: string;
  emailWrappedVmkIv: string;
}

export async function createEmailRecoveryMaterial(vmk: CryptoKey): Promise<EmailRecoveryMaterial> {
  const raw = randomBytes(32);
  const erkKey = await importAesKey(raw, false, ["wrapKey", "unwrapKey"]);
  const wrapped = await wrapKey(erkKey, vmk);
  return { erk: toBase64(raw), emailWrappedVmk: wrapped.ct, emailWrappedVmkIv: wrapped.iv };
}

export async function unwrapVmkWithErk(
  erkB64: string,
  emailWrappedVmk: string,
  emailWrappedVmkIv: string,
): Promise<CryptoKey> {
  const erkKey = await importAesKey(fromBase64(erkB64), false, ["wrapKey", "unwrapKey"]);
  return unwrapKey(erkKey, { ct: emailWrappedVmk, iv: emailWrappedVmkIv }, true);
}

// ─── Chunked file encryption (Stage-1 stream format) ──────────────────
export const CHUNK_SIZE = DEFAULT_CHUNK_SIZE;

// The NBX1 format is self-describing (chunk size + base nonce live in the blob
// header), so the historical contentIv/chunkSize fields are vestigial. We keep
// the signatures for API/DB compatibility: a placeholder satisfies the server's
// non-empty validation, and decrypt ignores both values.
const CONTENT_IV_PLACEHOLDER = "nbx1";

export async function encryptFileChunked(
  dek: CryptoKey,
  data: ArrayBuffer,
  chunkSize: number = CHUNK_SIZE,
): Promise<{ blob: Blob; contentIv: string; chunkSize: number }> {
  const framed = await encryptBytes(dek, new Uint8Array(data), { chunkSize });
  return {
    blob: new Blob([framed], { type: "application/octet-stream" }),
    contentIv: CONTENT_IV_PLACEHOLDER,
    chunkSize,
  };
}

export async function decryptFileChunked(
  dek: CryptoKey,
  ciphertext: ArrayBuffer,
  _contentIvB64?: string, // legacy, unused — format is self-describing
  _chunkSize?: number, // legacy, unused
): Promise<ArrayBuffer> {
  const plain = await decryptBytes(dek, new Uint8Array(ciphertext));
  return plain.buffer as ArrayBuffer;
}
