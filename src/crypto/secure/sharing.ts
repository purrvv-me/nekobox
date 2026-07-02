// Anonymous link-based sharing — an EXTENSION of the Stage 1 module.
// Builds only on the existing, tested primitives (aes/stream/codec); nothing
// in the original files is modified.
//
// Model
//   • A fresh random 256-bit share key is generated per share — the owner's
//     master key is never reused or exposed.
//   • The file body is re-encrypted under the share key using the Stage 1
//     chunked format; the display name is sealed under the same key.
//   • The share key travels ONLY inside the URL fragment (`#…`). Fragments are
//     never sent by browsers in HTTP requests or Referer headers, so the
//     server cannot see the key in any request, log, or redirect.
//   • The server stores just: share-id, the ciphertext blob, expiry/limit
//     metadata. It cannot decrypt the content under any circumstances.
//
// URL shape:  https://host/app#/s/<shareId>/<keyFragment>

import { importAesKey, open, seal, type Sealed } from "./aes";
import { decryptBytes, encryptBytes, type StreamOptions } from "./stream";
import { fromBase64, fromUtf8, randomBytes, toBase64, utf8 } from "./codec";

const SHARE_KEY_BYTES = 32;

// ─── base64url (fragment-safe) ────────────────────────────────────────
export function toFragment(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function fromFragment(fragment: string): Uint8Array<ArrayBuffer> {
  const b64 = fragment.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  return fromBase64(b64 + pad);
}

// ─── share keys ───────────────────────────────────────────────────────
/** Generate a fresh share key + its URL-fragment encoding. */
export async function generateShareKey(): Promise<{ key: CryptoKey; fragment: string }> {
  const raw = randomBytes(SHARE_KEY_BYTES);
  const key = await importAesKey(raw, /* extractable */ false);
  return { key, fragment: toFragment(raw) };
}

/** Rebuild the share key from a URL fragment. Throws on malformed input. */
export async function importShareKey(fragment: string): Promise<CryptoKey> {
  let raw: Uint8Array;
  try {
    raw = fromFragment(fragment.trim());
  } catch {
    throw new Error("Invalid share key");
  }
  if (raw.length !== SHARE_KEY_BYTES) throw new Error("Invalid share key");
  return importAesKey(raw, false);
}

// ─── packaging ────────────────────────────────────────────────────────
export interface SharePackage {
  /** URL-fragment encoding of the share key — put after `#`, never send to a server. */
  fragment: string;
  /** Ciphertext blob (Stage 1 chunked format) — safe to upload. */
  blob: Uint8Array<ArrayBuffer>;
  /** File name sealed under the share key — safe to upload. */
  encName: string;
}

/** Encrypt plaintext + name under a brand-new share key. */
export async function sealShare(
  plain: Uint8Array,
  name: string,
  opts?: StreamOptions,
): Promise<SharePackage> {
  const { key, fragment } = await generateShareKey();
  const blob = await encryptBytes(key, plain, opts);
  const sealedName = await seal(key, utf8(name));
  return { fragment, blob, encName: toBase64(utf8(JSON.stringify(sealedName))) };
}

/** Decrypt a shared blob + name using the key from the URL fragment. */
export async function openShare(
  fragment: string,
  blob: Uint8Array,
  encName: string,
): Promise<{ data: Uint8Array<ArrayBuffer>; name: string }> {
  const key = await importShareKey(fragment);
  const data = await decryptBytes(key, blob);
  const sealedName = JSON.parse(fromUtf8(fromBase64(encName))) as Sealed;
  const name = fromUtf8(await open(key, sealedName));
  return { data, name };
}

/** Decrypt only the shared name (e.g. to show it before consuming an open). */
export async function openShareName(fragment: string, encName: string): Promise<string> {
  const key = await importShareKey(fragment);
  const sealedName = JSON.parse(fromUtf8(fromBase64(encName))) as Sealed;
  return fromUtf8(await open(key, sealedName));
}
