import { z } from "zod";

const sealed = z.object({
  ciphertext: z.string().min(1),
  iv: z.string().min(1),
});

export const registerSchema = z.object({
  email: z.string().email().max(254).transform((e) => e.toLowerCase().trim()),
  password: z.string().min(8).max(1024),
  kdfSalt: z.string().min(1),
  wrappedVmk: z.string().min(1),
  wrappedVmkIv: z.string().min(1),
  recoverySalt: z.string().min(1),
  recoveryWrappedVmk: z.string().min(1),
  recoveryWrappedVmkIv: z.string().min(1),
  publicKey: z.string().min(1),
  encPrivateKey: z.string().min(1),
  encPrivateKeyIv: z.string().min(1),
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
  kdfSalt: z.string().min(1),
  wrappedVmk: z.string().min(1),
  wrappedVmkIv: z.string().min(1),
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
  kdfSalt: z.string().min(1),
  wrappedVmk: z.string().min(1),
  wrappedVmkIv: z.string().min(1),
  kdfIterations: z.number().int().min(100_000).max(10_000_000),
});

// ─── Optional email recovery ──────────────────────────────────────────
export const emailRecoveryBindSchema = z.object({
  email: z.string().email().max(254).transform((e) => e.toLowerCase().trim()),
  erk: z.string().min(1),
  emailWrappedVmk: z.string().min(1),
  emailWrappedVmkIv: z.string().min(1),
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
  kdfSalt: z.string().min(1),
  kdfIterations: z.number().int().min(100_000).max(10_000_000),
  wrappedVmk: z.string().min(1),
  wrappedVmkIv: z.string().min(1),
  recoverySalt: z.string().min(1),
  recoveryWrappedVmk: z.string().min(1),
  recoveryWrappedVmkIv: z.string().min(1),
});

export const presignSchema = z.object({
  mimeType: z.string().min(1).max(255),
  size: z.number().int().positive(),
});

export const finalizeFileSchema = z.object({
  storageKey: z.string().min(1),
  encName: z.string().min(1),
  encNameIv: z.string().min(1),
  mimeType: z.string().min(1).max(255),
  wrappedDek: z.string().min(1),
  wrappedDekIv: z.string().min(1),
  contentIv: z.string().min(1),
  chunkSize: z.number().int().nonnegative().max(64 * 1024 * 1024),
  folderId: z.string().min(1).nullish(),
});

export const createFolderSchema = z.object({
  encName: z.string().min(1),
  encNameIv: z.string().min(1),
});

// Rename and/or move a file. folderId === null means "move to vault root";
// undefined means "leave folder unchanged".
export const updateFileSchema = z
  .object({
    encName: z.string().min(1).optional(),
    encNameIv: z.string().min(1).optional(),
    folderId: z.string().min(1).nullish(),
  })
  .refine((d) => d.encName !== undefined || d.folderId !== undefined, {
    message: "Nothing to update",
  });

export const updateFolderSchema = z.object({
  encName: z.string().min(1),
  encNameIv: z.string().min(1),
});

export const shareSchema = z.object({
  fileId: z.string().min(1),
  toEmail: z.string().email().max(254).transform((e) => e.toLowerCase().trim()),
  rsaWrappedDek: z.string().min(1),
  encName: sealed.shape.ciphertext,
  encNameIv: sealed.shape.iv,
});
