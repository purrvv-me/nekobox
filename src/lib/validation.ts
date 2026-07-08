import { z } from "zod";

const encryptedField = z.string().min(1).max(8192);
const shortCryptoField = z.string().min(1).max(512);
export const storageKeySchema = z.string().min(1).max(512);

const sealed = z.object({
  ciphertext: encryptedField,
  iv: shortCryptoField,
});

export const registerSchema = z.object({
  email: z.string().email().max(254).transform((e) => e.toLowerCase().trim()),
  password: z.string().min(8).max(1024),
  kdfSalt: shortCryptoField,
  wrappedVmk: encryptedField,
  wrappedVmkIv: shortCryptoField,
  vmkVerifier: encryptedField,
  vmkVerifierIv: shortCryptoField,
  recoverySalt: shortCryptoField,
  recoveryWrappedVmk: encryptedField,
  recoveryWrappedVmkIv: shortCryptoField,
  kdfIterations: z.number().int().min(100_000).max(10_000_000),
});

export const loginSchema = z.object({
  email: z.string().email().max(254).transform((e) => e.toLowerCase().trim()),
  password: z.string().min(1).max(1024),
});

// Change password: server re-checks the current password (argon2), then stores
// the new password hash + the VMK re-wrapped under the new password key.
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(1024),
  newPassword: z.string().min(8).max(1024),
  kdfSalt: shortCryptoField,
  wrappedVmk: encryptedField,
  wrappedVmkIv: shortCryptoField,
  vmkVerifier: encryptedField.optional(),
  vmkVerifierIv: shortCryptoField.optional(),
  kdfIterations: z.number().int().min(100_000).max(10_000_000),
});

export const recoverMaterialSchema = z.object({
  email: z.string().email().max(254).transform((e) => e.toLowerCase().trim()),
});

// Reset via recovery code: client already unwrapped the VMK with the code and
// re-wrapped it under a new password key. Server sets the new password material.
export const recoverResetSchema = z.object({
  email: z.string().email().max(254).transform((e) => e.toLowerCase().trim()),
  newPassword: z.string().min(8).max(1024),
  kdfSalt: shortCryptoField,
  wrappedVmk: encryptedField,
  wrappedVmkIv: shortCryptoField,
  vmkVerifier: encryptedField,
  vmkVerifierIv: shortCryptoField,
  kdfIterations: z.number().int().min(100_000).max(10_000_000),
});

// ─── Optional email recovery ──────────────────────────────────────────
export const emailRecoveryBindSchema = z.object({
  email: z.string().email().max(254).transform((e) => e.toLowerCase().trim()),
  erk: encryptedField,
  emailWrappedVmk: encryptedField,
  emailWrappedVmkIv: shortCryptoField,
});

export const emailRecoveryRequestSchema = z.object({
  email: z.string().email().max(254).transform((e) => e.toLowerCase().trim()),
});

export const emailRecoveryTokenSchema = z.object({
  token: z.string().min(1).max(4096),
});

// Complete = ticket + full replacement password/recovery material built
// client-side after unwrapping the VMK with the released ERK.
export const emailRecoveryCompleteSchema = z.object({
  token: z.string().min(1).max(4096),
  newPassword: z.string().min(8).max(1024),
  kdfSalt: shortCryptoField,
  kdfIterations: z.number().int().min(100_000).max(10_000_000),
  wrappedVmk: encryptedField,
  wrappedVmkIv: shortCryptoField,
  vmkVerifier: encryptedField,
  vmkVerifierIv: shortCryptoField,
  recoverySalt: shortCryptoField,
  recoveryWrappedVmk: encryptedField,
  recoveryWrappedVmkIv: shortCryptoField,
});

export const presignSchema = z.object({
  mimeType: z.string().min(1).max(255),
  size: z.number().int().positive(),
});

export const finalizeFileSchema = z.object({
  storageKey: storageKeySchema,
  encName: encryptedField,
  encNameIv: shortCryptoField,
  mimeType: z.string().min(1).max(255),
  wrappedDek: encryptedField,
  wrappedDekIv: shortCryptoField,
  contentIv: shortCryptoField,
  chunkSize: z.number().int().nonnegative().max(64 * 1024 * 1024),
  folderId: z.string().min(1).max(128).nullish(),
});

export const createFolderSchema = z.object({
  encName: encryptedField,
  encNameIv: shortCryptoField,
});

// Rename and/or move a file. folderId === null means "move to vault root";
// undefined means "leave folder unchanged".
export const updateFileSchema = z
  .object({
    encName: encryptedField.optional(),
    encNameIv: shortCryptoField.optional(),
    folderId: z.string().min(1).max(128).nullish(),
  })
  .refine((d) => d.encName !== undefined || d.folderId !== undefined, {
    message: "Nothing to update",
  });

export const updateFolderSchema = z.object({
  encName: encryptedField,
  encNameIv: shortCryptoField,
});

export const shareSchema = z.object({
  fileId: z.string().min(1),
  toEmail: z.string().email().max(254).transform((e) => e.toLowerCase().trim()),
  rsaWrappedDek: encryptedField,
  encName: sealed.shape.ciphertext,
  encNameIv: sealed.shape.iv,
});
