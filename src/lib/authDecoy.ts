import { createHmac } from "crypto";

// Deterministic, plausible-looking recovery material for UNKNOWN accounts.
// Returned (instead of a 404) so an attacker can't use /recover-material as an
// account-existence oracle: a non-existent email is indistinguishable from a
// wrong recovery code — both simply fail to unwrap the VMK locally.
//
// Stable per email (no per-request variance tell) and cryptographically
// useless (derived from the server secret, never wraps a real key).
export interface RecoveryMaterial {
  recoverySalt: string;
  recoveryWrappedVmk: string;
  recoveryWrappedVmkIv: string;
}

export function decoyRecoveryMaterial(secret: string, email: string): RecoveryMaterial {
  const bytes = (label: string, n: number) => {
    let out = Buffer.alloc(0);
    for (let i = 0; out.length < n; i++) {
      out = Buffer.concat([out, createHmac("sha256", secret).update(`${label}:${i}:${email}`).digest()]);
    }
    return out.subarray(0, n).toString("base64");
  };
  return {
    recoverySalt: bytes("salt", 16),
    recoveryWrappedVmk: bytes("vmk", 48), // 32-byte key + 16-byte GCM tag
    recoveryWrappedVmkIv: bytes("iv", 12),
  };
}
