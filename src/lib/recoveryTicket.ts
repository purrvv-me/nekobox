// Email-recovery tickets + email hashing. Pure functions (secrets passed in),
// so the whole module is unit-testable without env/DB.
//
// Design notes
//  • The email is NEVER stored in the clear: only HMAC-SHA256(emailHashKey,
//    normalized email). The hash key is separate from anything related to file
//    encryption (those keys never exist server-side at all).
//  • A recovery request issues a short-lived SIGNED ticket (HS256) whose jti is
//    also persisted on the user row. Completing recovery requires the ticket
//    signature AND a matching, unconsumed jti — nothing in the request body is
//    trusted without this proof.

import { SignJWT, jwtVerify } from "jose";

const PURPOSE = "email-recovery";
export const TICKET_TTL_SECONDS = 15 * 60;

const te = new TextEncoder();

/** Canonicalize an email for hashing (trim, lowercase). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Keyed hash of an email — deterministic, but useless without the key. */
export async function hashEmail(hashKey: string, email: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    te.encode(hashKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, te.encode(normalizeEmail(email)));
  return Buffer.from(mac).toString("base64url");
}

export interface RecoveryTicket {
  userId: string;
  jti: string;
}

/** Create a signed, expiring recovery ticket. */
export async function createRecoveryTicket(
  secret: string,
  userId: string,
  jti: string,
  ttlSeconds: number = TICKET_TTL_SECONDS,
): Promise<string> {
  return new SignJWT({ purpose: PURPOSE })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(te.encode(secret));
}

/** Verify signature/expiry/purpose. Returns null on ANY failure. */
export async function verifyRecoveryTicket(
  secret: string,
  token: string,
): Promise<RecoveryTicket | null> {
  try {
    const { payload } = await jwtVerify(token, te.encode(secret), { algorithms: ["HS256"] });
    if (payload.purpose !== PURPOSE || !payload.sub || typeof payload.jti !== "string") return null;
    return { userId: payload.sub, jti: payload.jti };
  } catch {
    return null;
  }
}
