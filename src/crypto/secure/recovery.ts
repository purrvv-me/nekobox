// Recovery-code generation & normalisation.
//
// A recovery code is a high-entropy random string the user stores offline. It
// wraps the master key (see ./keyset), so it can restore the vault if the
// password is forgotten. Encoded in Crockford Base32 (no I/L/O/U, case-
// insensitive, resistant to transcription errors) and grouped for readability.

import { randomBytes } from "./codec";

// Crockford Base32 alphabet.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const DECODE: Record<string, number> = {};
for (let i = 0; i < ALPHABET.length; i++) DECODE[ALPHABET[i]] = i;
// Common transcription aliases.
DECODE["I"] = 1;
DECODE["L"] = 1;
DECODE["O"] = 0;
DECODE["U"] = DECODE["V"];

/** Default entropy for a recovery code, in bits. */
export const RECOVERY_BITS = 160;

/**
 * Generate a recovery code with `bits` of entropy (default 160), formatted as
 * dash-separated groups of 4, e.g. `A1B2-C3D4-...`.
 */
export function generateRecoveryCode(bits: number = RECOVERY_BITS, group = 4): string {
  const nBytes = Math.ceil(bits / 8);
  const chars = encodeBase32(randomBytes(nBytes));
  const out: string[] = [];
  for (let i = 0; i < chars.length; i += group) out.push(chars.slice(i, i + group));
  return out.join("-");
}

/**
 * Canonicalise a user-typed code: strip separators/spaces, uppercase, and map
 * look-alike characters. Use this before deriving a key so formatting or minor
 * transcription differences don't matter.
 */
export function normalizeRecoveryCode(code: string): string {
  return code
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .split("")
    .map((c) => (c in DECODE ? ALPHABET[DECODE[c]] : c))
    .join("");
}

function encodeBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}
