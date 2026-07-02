import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, hashPassword, verifyPassword } from "@/lib/auth";
import { changePasswordSchema } from "@/lib/validation";
import { ok, error, unauthorized } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";

// POST /api/auth/change-password
// The client unwrapped the VMK with the current password and re-wrapped it
// under a key derived from the new password. We verify the current password
// (argon2) and store the new hash + the re-wrapped VMK. Because the VMK itself
// never changes, all existing files/folders remain decryptable.
export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return unauthorized();

  const limit = rateLimit(`pwchange:${session.sub}`, 5, 15 * 60 * 1000);
  if (!limit.ok) return error("Too many attempts. Try later.", 429);

  const body = await req.json().catch(() => null);
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) return error("Invalid payload", 422);
  const d = parsed.data;

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { passwordHash: true },
  });
  if (!user) return unauthorized();

  if (!(await verifyPassword(user.passwordHash, d.currentPassword))) {
    return error("Current password is incorrect", 403);
  }

  await prisma.user.update({
    where: { id: session.sub },
    data: {
      passwordHash: await hashPassword(d.newPassword),
      kdfSalt: d.kdfSalt,
      kdfIterations: d.kdfIterations,
      wrappedVmk: d.wrappedVmk,
      wrappedVmkIv: d.wrappedVmkIv,
    },
  });

  return ok({ ok: true });
}
