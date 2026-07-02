// RSA-OAEP keypairs for user-to-user sharing.
//
// Each user has a keypair: the PUBLIC key (SPKI) is stored server-side in the
// clear (public by design); the PRIVATE key (PKCS8) is sealed under the user's
// master key before it ever leaves the browser. Sharing a file wraps its
// symmetric DEK with the recipient's public key, so only they can unwrap it.

import { Sealed, open, seal } from "./aes";
import { bs, fromBase64, toBase64 } from "./codec";

const RSA_PARAMS: RsaHashedKeyGenParams = {
  name: "RSA-OAEP",
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256",
};

export interface WrappedRsaKeypair {
  /** SPKI, base64 — safe to publish. */
  publicKey: string;
  /** PKCS8 private key sealed (AES-GCM) under the given master key. */
  encPrivateKey: Sealed;
}

/** Generate a keypair and seal the private half under `masterKey`. */
export async function generateWrappedRsaKeypair(masterKey: CryptoKey): Promise<WrappedRsaKeypair> {
  const pair = await crypto.subtle.generateKey(RSA_PARAMS, true, ["wrapKey", "unwrapKey"]);
  const spki = await crypto.subtle.exportKey("spki", pair.publicKey);
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
  const encPrivateKey = await seal(masterKey, new Uint8Array(pkcs8));
  return { publicKey: toBase64(spki), encPrivateKey };
}

/** Unseal + import the private key (non-extractable, unwrap-only). */
export async function importWrappedRsaPrivateKey(
  masterKey: CryptoKey,
  encPrivateKey: Sealed,
): Promise<CryptoKey> {
  const pkcs8 = await open(masterKey, encPrivateKey);
  return crypto.subtle.importKey("pkcs8", bs(pkcs8), { name: "RSA-OAEP", hash: "SHA-256" }, false, [
    "unwrapKey",
  ]);
}

/** Import someone's published public key for wrapping keys to them. */
export async function importRsaPublicKey(spkiB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "spki",
    bs(fromBase64(spkiB64)),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["wrapKey"],
  );
}

/** Wrap an AES key (e.g. a file DEK) with a recipient's public key. */
export async function rsaWrapAesKey(recipientPublic: CryptoKey, key: CryptoKey): Promise<string> {
  const wrapped = await crypto.subtle.wrapKey("raw", key, recipientPublic, { name: "RSA-OAEP" });
  return toBase64(wrapped);
}

/** Unwrap an AES key that was wrapped with OUR public key. */
export async function rsaUnwrapAesKey(privateKey: CryptoKey, wrappedB64: string): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    "raw",
    bs(fromBase64(wrappedB64)),
    privateKey,
    { name: "RSA-OAEP" },
    { name: "AES-GCM" },
    true,
    ["encrypt", "decrypt", "wrapKey", "unwrapKey"],
  );
}
