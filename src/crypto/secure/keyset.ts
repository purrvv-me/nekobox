// High-level vault keyset — the KEK/VMK pattern.
//
// A random master key encrypts everything (files, metadata). That master key is
// wrapped twice: once under a key derived from the password, once under a key
// derived from a recovery code. Consequences:
//   • changing the password only re-wraps the master key (no bulk re-encryption)
//   • losing the password is survivable via the recovery code
//   • the master key never leaves memory in the clear; the server (if any) only
//     ever sees the two wrapped copies + salts.

import { Sealed, generateAesKey, unwrapKey, wrapKey } from "./aes";
import { randomSaltB64 } from "./codec";
import { KdfParams, DEFAULT_PBKDF2, deriveKey } from "./kdf";
import { generateRecoveryCode, normalizeRecoveryCode } from "./recovery";

interface KeySlot {
  salt: string;
  kdf: KdfParams;
  wrapped: Sealed;
}

/** Everything needed to reconstruct the master key — safe to persist/serialize. */
export interface VaultKeyset {
  v: 1;
  password: KeySlot;
  recovery: KeySlot;
}

export interface CreatedVault {
  keyset: VaultKeyset;
  masterKey: CryptoKey;
  recoveryCode: string;
}

export interface CreateOptions {
  kdf?: KdfParams; // KDF for the password slot (default PBKDF2)
  recoveryKdf?: KdfParams; // KDF for the recovery slot
  recoveryBits?: number;
}

async function makeSlot(secret: string, kdf: KdfParams, masterKey: CryptoKey): Promise<KeySlot> {
  const salt = randomSaltB64();
  const kek = await deriveKey(secret, salt, kdf);
  const wrapped = await wrapKey(kek, masterKey);
  return { salt, kdf, wrapped };
}

async function openSlot(secret: string, slot: KeySlot): Promise<CryptoKey> {
  const kek = await deriveKey(secret, slot.salt, slot.kdf);
  return unwrapKey(kek, slot.wrapped, /* extractable */ true);
}

/** Create a brand-new vault: master key + password & recovery wrappings. */
export async function createVault(password: string, opts: CreateOptions = {}): Promise<CreatedVault> {
  const kdf = opts.kdf ?? DEFAULT_PBKDF2;
  const recoveryKdf = opts.recoveryKdf ?? DEFAULT_PBKDF2;
  const masterKey = await generateAesKey(); // extractable so it can be re-wrapped
  const recoveryCode = generateRecoveryCode(opts.recoveryBits);

  const [password_, recovery] = await Promise.all([
    makeSlot(password, kdf, masterKey),
    makeSlot(normalizeRecoveryCode(recoveryCode), recoveryKdf, masterKey),
  ]);

  return { keyset: { v: 1, password: password_, recovery }, masterKey, recoveryCode };
}

/** Unlock the master key with the password. Throws on a wrong password. */
export async function unlockWithPassword(keyset: VaultKeyset, password: string): Promise<CryptoKey> {
  return wrapErr(() => openSlot(password, keyset.password), "Incorrect password");
}

/** Unlock the master key with the recovery code. Throws on a wrong code. */
export async function unlockWithRecovery(keyset: VaultKeyset, code: string): Promise<CryptoKey> {
  return wrapErr(() => openSlot(normalizeRecoveryCode(code), keyset.recovery), "Invalid recovery code");
}

/** Re-wrap the (already unlocked) master key under a new password. */
export async function changePassword(
  keyset: VaultKeyset,
  masterKey: CryptoKey,
  newPassword: string,
): Promise<VaultKeyset> {
  const password = await makeSlot(newPassword, keyset.password.kdf, masterKey);
  return { ...keyset, password };
}

/** Recover with the code, then set a new password. Returns the updated keyset + key. */
export async function resetPasswordWithRecovery(
  keyset: VaultKeyset,
  code: string,
  newPassword: string,
): Promise<{ keyset: VaultKeyset; masterKey: CryptoKey }> {
  const masterKey = await unlockWithRecovery(keyset, code);
  const updated = await changePassword(keyset, masterKey, newPassword);
  return { keyset: updated, masterKey };
}

/** Issue a fresh recovery code (invalidates the old one). Master key must be unlocked. */
export async function rotateRecoveryCode(
  keyset: VaultKeyset,
  masterKey: CryptoKey,
  bits?: number,
): Promise<{ keyset: VaultKeyset; recoveryCode: string }> {
  const recoveryCode = generateRecoveryCode(bits);
  const recovery = await makeSlot(normalizeRecoveryCode(recoveryCode), keyset.recovery.kdf, masterKey);
  return { keyset: { ...keyset, recovery }, recoveryCode };
}

async function wrapErr<T>(fn: () => Promise<T>, message: string): Promise<T> {
  try {
    return await fn();
  } catch {
    throw new Error(message);
  }
}
