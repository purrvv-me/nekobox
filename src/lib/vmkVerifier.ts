import "server-only";
import { open, unwrapKey } from "@/crypto/secure/aes";
import { deriveKeyPBKDF2 } from "@/crypto/secure/kdf";
import { timingSafeEqual, utf8 } from "@/crypto/secure/codec";

const VMK_VERIFIER_TEXT = "nekobox-vmk-verifier-v1";
const VMK_VERIFIER_BYTES = utf8(VMK_VERIFIER_TEXT);

export interface WrappedVmkMaterial {
  newPassword: string;
  kdfSalt: string;
  kdfIterations: number;
  wrappedVmk: string;
  wrappedVmkIv: string;
}

export async function unwrapSubmittedVmk(material: WrappedVmkMaterial): Promise<CryptoKey> {
  const kek = await deriveKeyPBKDF2(material.newPassword, material.kdfSalt, {
    name: "PBKDF2",
    hash: "SHA-256",
    iterations: material.kdfIterations,
  });
  return unwrapKey(kek, { ct: material.wrappedVmk, iv: material.wrappedVmkIv }, true);
}

export async function verifyVmkVerifier(
  vmk: CryptoKey,
  verifier: { ciphertext: string; iv: string },
): Promise<boolean> {
  try {
    const plain = await open(vmk, { ct: verifier.ciphertext, iv: verifier.iv });
    return timingSafeEqual(plain, VMK_VERIFIER_BYTES);
  } catch {
    return false;
  }
}

export async function verifyExistingCiphertext(
  vmk: CryptoKey,
  sealed: { ciphertext: string; iv: string } | null,
): Promise<boolean> {
  if (!sealed) return false;
  try {
    await open(vmk, { ct: sealed.ciphertext, iv: sealed.iv });
    return true;
  } catch {
    return false;
  }
}

