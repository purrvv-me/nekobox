import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { recoverResetSchema } from "@/lib/validation";
import { ok, error } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";
import { unwrapSubmittedVmk, verifyExistingCiphertext, verifyVmkVerifier } from "@/lib/vmkVerifier";

// POST /api/auth/recover-reset
// After the client unwraps the VMK with the recovery code, it re-wraps the VMK
// under a key derived from a new password and posts the new password material.
// The server proves that the submitted wrapping contains the EXISTING VMK by
// checking a VMK-encrypted verifier. Legacy accounts without that verifier fall
// back to checking one existing encrypted file/folder name.
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const limit = rateLimit(`recreset:${ip}`, 5, 30 * 60 * 1000);
  if (!limit.ok) return error("Too many attempts. Try later.", 429);

  const body = await req.json().catch(() => null);
  const parsed = recoverResetSchema.safeParse(body);
  if (!parsed.success) return error("Invalid payload", 422);
  const d = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email: d.email },
    select: { id: true, vmkVerifier: true, vmkVerifierIv: true },
  });
  if (!user) return error("Could not verify recovery material", 403);

  let candidateVmk: CryptoKey;
  try {
    candidateVmk = await unwrapSubmittedVmk(d);
  } catch {
    return error("Could not verify recovery material", 403);
  }

  let verified = false;
  if (user.vmkVerifier && user.vmkVerifierIv) {
    verified = await verifyVmkVerifier(candidateVmk, {
      ciphertext: user.vmkVerifier,
      iv: user.vmkVerifierIv,
    });
  } else {
    const folder = await prisma.folder.findFirst({
      where: { ownerId: user.id },
      select: { encName: true, encNameIv: true },
    });
    const file = folder
      ? null
      : await prisma.file.findFirst({
          where: { ownerId: user.id },
          select: { encName: true, encNameIv: true },
        });
    const proof = folder
      ? { ciphertext: folder.encName, iv: folder.encNameIv }
      : file
        ? { ciphertext: file.encName, iv: file.encNameIv }
        : null;
    verified = await verifyExistingCiphertext(candidateVmk, proof);
  }

  if (!verified) return error("Could not verify recovery material", 403);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(d.newPassword),
      kdfSalt: d.kdfSalt,
      kdfIterations: d.kdfIterations,
      wrappedVmk: d.wrappedVmk,
      wrappedVmkIv: d.wrappedVmkIv,
      vmkVerifier: d.vmkVerifier,
      vmkVerifierIv: d.vmkVerifierIv,
    },
  });

  return ok({ ok: true });
}
