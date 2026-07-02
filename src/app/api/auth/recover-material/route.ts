import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { decoyRecoveryMaterial } from "@/lib/authDecoy";
import { recoverMaterialSchema } from "@/lib/validation";
import { ok, error } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";

// POST /api/auth/recover-material
// Returns the recovery-wrapped VMK so the client can try to unwrap it with the
// user's 160-bit recovery code (unwrap succeeds only with the correct code).
//
// To avoid an account-enumeration oracle, the response is ALWAYS a 200 with
// the same shape and (near-)constant time: for a non-existent email we return
// deterministic DECOY material derived from the email + server secret. An
// attacker can't distinguish "no such account" from "wrong recovery code" —
// both simply fail to unwrap locally.
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

  if (user) {
    return ok({
      recoverySalt: user.recoverySalt,
      recoveryWrappedVmk: user.recoveryWrappedVmk,
      recoveryWrappedVmkIv: user.recoveryWrappedVmkIv,
    });
  }
  // Unknown account → decoy material (same 200 shape; no existence oracle).
  return ok(decoyRecoveryMaterial(process.env.JWT_SECRET ?? "nekobox", parsed.data.email));
}
