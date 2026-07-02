// Challenge–response auth. No passwords. A vault proves it holds its auth
// private key (available to the client only after a successful LOCAL unlock) by
// signing a server nonce with ECDSA P-256. The server verifies against the
// vault's stored PUBLIC key and issues a short-lived bearer token.

import { createPublicKey, randomBytes, verify as nodeVerify } from "node:crypto";

const CHALLENGE_TTL = 2 * 60 * 1000; // 2 min
const TOKEN_TTL = 60 * 60 * 1000; // 1 hour

interface Pending {
  vaultId: string;
  exp: number;
}
const challenges = new Map<string, Pending>(); // nonce -> pending
const sessions = new Map<string, Pending>(); // token -> session

function sweep() {
  const now = Date.now();
  for (const [k, v] of challenges) if (v.exp < now) challenges.delete(k);
  for (const [k, v] of sessions) if (v.exp < now) sessions.delete(k);
}
setInterval(sweep, 60_000).unref?.();

/** Issue a random nonce the client must sign. */
export function createChallenge(vaultId: string): string {
  const nonce = randomBytes(32).toString("base64");
  challenges.set(nonce, { vaultId, exp: Date.now() + CHALLENGE_TTL });
  return nonce;
}

/**
 * Verify an ECDSA P-256 signature (IEEE-P1363 / Web Crypto format) over the
 * nonce, using the vault's SPKI public key. Consumes the challenge.
 */
export function verifyChallenge(
  vaultId: string,
  nonceB64: string,
  signatureB64: string,
  publicKeySpkiB64: string,
): boolean {
  const pending = challenges.get(nonceB64);
  challenges.delete(nonceB64);
  if (!pending || pending.vaultId !== vaultId || pending.exp < Date.now()) return false;
  try {
    const key = createPublicKey({
      key: Buffer.from(publicKeySpkiB64, "base64"),
      format: "der",
      type: "spki",
    });
    return nodeVerify(
      "SHA-256",
      Buffer.from(nonceB64, "base64"),
      { key, dsaEncoding: "ieee-p1363" },
      Buffer.from(signatureB64, "base64"),
    );
  } catch {
    return false;
  }
}

export function issueToken(vaultId: string): { token: string; expiresIn: number } {
  const token = randomBytes(32).toString("base64url");
  sessions.set(token, { vaultId, exp: Date.now() + TOKEN_TTL });
  return { token, expiresIn: TOKEN_TTL };
}

/** Resolve a bearer token to its vault id, or null if invalid/expired. */
export function resolveToken(token: string | undefined): string | null {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s || s.exp < Date.now()) return null;
  return s.vaultId;
}
