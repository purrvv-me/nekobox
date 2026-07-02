// Password-based key derivation.
//
// Default: PBKDF2-HMAC-SHA256 (always available via Web Crypto).
// Optional: Argon2id via the "hash-wasm" package IF it is installed — loaded
// lazily so the module has zero hard dependencies. Falls back / throws with a
// clear message when unavailable.
//
// Both derive a 256-bit AES-GCM key usable as a Key-Encryption-Key (KEK):
// it can wrap/unwrap the master key and encrypt/decrypt small values.

import { fromBase64, utf8 } from "./codec";

const KEK_USAGES: KeyUsage[] = ["wrapKey", "unwrapKey", "encrypt", "decrypt"];

export interface Pbkdf2Params {
  name: "PBKDF2";
  hash: "SHA-256" | "SHA-512";
  iterations: number;
}

export interface Argon2idParams {
  name: "argon2id";
  /** memory cost in KiB */
  memoryKiB: number;
  /** time cost (passes) */
  iterations: number;
  parallelism: number;
}

export type KdfParams = Pbkdf2Params | Argon2idParams;

export const DEFAULT_PBKDF2: Pbkdf2Params = {
  name: "PBKDF2",
  hash: "SHA-256",
  iterations: 600_000, // OWASP-recommended floor for PBKDF2-HMAC-SHA256 (2023+)
};

export const DEFAULT_ARGON2ID: Argon2idParams = {
  name: "argon2id",
  memoryKiB: 19_456, // 19 MiB
  iterations: 2,
  parallelism: 1,
};

/** Derive a KEK from a password + salt using PBKDF2. */
export async function deriveKeyPBKDF2(
  password: string,
  saltB64: string,
  params: Pbkdf2Params = DEFAULT_PBKDF2,
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey("raw", utf8(password), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: fromBase64(saltB64), iterations: params.iterations, hash: params.hash },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    KEK_USAGES,
  );
}

/** Whether an Argon2id implementation (hash-wasm) is importable at runtime. */
export async function isArgon2Available(): Promise<boolean> {
  return (await loadHashWasm()) !== null;
}

/**
 * Derive a KEK from a password + salt using Argon2id via hash-wasm.
 * Throws if hash-wasm is not installed.
 */
export async function deriveKeyArgon2id(
  password: string,
  saltB64: string,
  params: Argon2idParams = DEFAULT_ARGON2ID,
): Promise<CryptoKey> {
  const mod = await loadHashWasm();
  if (!mod || typeof mod.argon2id !== "function") {
    throw new Error('Argon2id unavailable. Install "hash-wasm" to enable Argon2id KDF.');
  }
  const raw: Uint8Array = await mod.argon2id({
    password: utf8(password),
    salt: fromBase64(saltB64),
    parallelism: params.parallelism,
    iterations: params.iterations,
    memorySize: params.memoryKiB,
    hashLength: 32,
    outputType: "binary",
  });
  return crypto.subtle.importKey("raw", Uint8Array.from(raw), { name: "AES-GCM" }, false, KEK_USAGES);
}

/** Derive a KEK using whichever algorithm the params describe. */
export async function deriveKey(
  password: string,
  saltB64: string,
  params: KdfParams = DEFAULT_PBKDF2,
): Promise<CryptoKey> {
  return params.name === "argon2id"
    ? deriveKeyArgon2id(password, saltB64, params)
    : deriveKeyPBKDF2(password, saltB64, params);
}

// Lazy, dependency-optional load of hash-wasm. The indirect specifier keeps
// bundlers/TypeScript from treating it as a hard import.
let _hashWasm: unknown | null | undefined;
async function loadHashWasm(): Promise<any | null> {
  if (_hashWasm !== undefined) return _hashWasm as any;
  try {
    const spec = "hash-wasm";
    _hashWasm = await import(/* @vite-ignore */ /* webpackIgnore: true */ spec);
  } catch {
    _hashWasm = null;
  }
  return _hashWasm as any;
}
