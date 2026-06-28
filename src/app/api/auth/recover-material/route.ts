import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { recoverMaterialSchema } from "@/lib/validation";
import { ok, error } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";

// POST /api/auth/recover-material
// Returns the recovery-wrapped VMK so the client can try to unwrap it with the
// user's recovery code (the unwrap succeeds only with the correct code). The
// recovery code is 160-bit, so handing out the ciphertext is computationally
// safe — but we still rate-limit and return a generic response to limit
// account enumeration and harvesting.
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const limit = rateLimit(`recmat:${ip}`, 10, 15 * 60 * 1000);
  if (!limit.ok) return error("Too many attempts. Try later.", 429);

  const body = await req.json().catch(() => null);
  const parsed = recoverMaterialSchema.safeParse(body);
  if (!parsed.success) return error("Invalid payload", 422);

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { recoverySalt: true, recoveryWrappedVmk: true, recoveryWrappedVmkIv: true },
  });
  // Generic 404 either way (don't confirm which emails exist beyond timing).
  if (!user) return error("No recovery material for that account", 404);

  return ok({
    recoverySalt: user.recoverySalt,
    recoveryWrappedVmk: user.recoveryWrappedVmk,
    recoveryWrappedVmkIv: user.recoveryWrappedVmkIv,
  });
}
