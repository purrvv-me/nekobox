import { argon2id, argon2Verify } from "hash-wasm";

// Argon2id password hashing + verification via hash-wasm (WebAssembly — no
// native binaries, so it loads identically in local dev, serverless functions
// (Netlify/Vercel), and edge runtimes; the native `argon2` package failed to
// load inside Netlify Functions). Auth only; independent from the PBKDF2 keys
// used for encryption. No Next/server coupling, so it's unit testable.

// 19 MiB memory, 2 passes, single lane — same cost as the previous argon2id.
const PARAMS = { parallelism: 1, iterations: 2, memorySize: 19456, hashLength: 32 } as const;

function randomSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

export async function hashPassword(password: string): Promise<string> {
  return argon2id({
    password,
    salt: randomSalt(),
    ...PARAMS,
    // Standard PHC string ($argon2id$v=19$m=...$salt$hash); argon2Verify reads
    // the params + salt back out of it, so verify only needs password + hash.
    outputType: "encoded",
  });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2Verify({ password, hash });
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
    await argon2Verify({ password, hash: await dummyHashPromise });
  } catch {
    /* result intentionally discarded */
  }
}
