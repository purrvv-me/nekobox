import argon2 from "argon2";

// Argon2id password hashing + verification (auth only; independent from the
// PBKDF2 keys used for encryption). No Next/server coupling, so it's unit
// testable in isolation.

const ARGON2_OPTS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

// Constant-time defence against account enumeration: when there is no user to
// verify against, run an equivalent argon2 verify against a fixed dummy hash so
// response time doesn't reveal whether the account exists.
let dummyHashPromise: Promise<string> | null = null;
export async function verifyPasswordDummy(password: string): Promise<void> {
  dummyHashPromise ??= hashPassword("nekobox-nonexistent-account-placeholder");
  try {
    await argon2.verify(await dummyHashPromise, password);
  } catch {
    /* result intentionally discarded */
  }
}
