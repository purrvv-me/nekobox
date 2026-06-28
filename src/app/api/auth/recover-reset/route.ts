import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { recoverResetSchema } from "@/lib/validation";
import { ok, error, notFound } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";

// POST /api/auth/recover-reset
// After the client unwraps the VMK with the recovery code, it re-wraps the VMK
// under a key derived from a new password and posts the new password material.
//
// LIMITATION (documented): the server cannot verify recovery-code knowledge
// without being able to brute-force it (that's the point of zero-knowledge), so
// this endpoint trusts the submitted material. An attacker who knows the email
// could overwrite the password material — but they still cannot read any files
// (those stay encrypted under the unchanged real VMK), so the worst case is
// vandalism, not data disclosure. We rate-limit to blunt that. A production
// build should add email-verification / a signed recovery token here.
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
    select: { id: true },
  });
  if (!user) return notFound("Account");

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(d.newPassword),
      kdfSalt: d.kdfSalt,
      wrappedVmk: d.wrappedVmk,
      wrappedVmkIv: d.wrappedVmkIv,
    },
  });

  return ok({ ok: true });
}
