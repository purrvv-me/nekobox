import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { verifyRecoveryTicket } from "@/lib/recoveryTicket";
import { emailRecoveryCompleteSchema } from "@/lib/validation";
import { emailRecoveryEnabled } from "@/lib/featureFlags";
import { ok, error } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";

// POST — finish email recovery. The client has already unwrapped the VMK with
// the released ERK and rebuilt fresh password + recovery-code wrappings; this
// route verifies the ticket and ATOMICALLY consumes its jti (updateMany with
// the jti in the WHERE clause), so a ticket can be spent exactly once. Nothing
// from the body is trusted without that proof.
export async function POST(req: NextRequest) {
  if (!emailRecoveryEnabled()) return error("Email recovery is currently unavailable", 503);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const limit = rateLimit(`emailcomplete:${ip}`, 5, 15 * 60 * 1000);
  if (!limit.ok) return error("Too many attempts. Try later.", 429);

  const body = await req.json().catch(() => null);
  const parsed = emailRecoveryCompleteSchema.safeParse(body);
  if (!parsed.success) return error("Invalid payload", 422);
  const d = parsed.data;

  const ticket = await verifyRecoveryTicket(process.env.JWT_SECRET!, d.token);
  if (!ticket) return error("This recovery link is invalid or has expired", 403);

  const passwordHash = await hashPassword(d.newPassword);

  // Single-use: only succeeds while the jti is still the current one.
  const res = await prisma.user.updateMany({
    where: { id: ticket.userId, emailTicketJti: ticket.jti },
    data: {
      passwordHash,
      kdfSalt: d.kdfSalt,
      kdfIterations: d.kdfIterations,
      wrappedVmk: d.wrappedVmk,
      wrappedVmkIv: d.wrappedVmkIv,
      recoverySalt: d.recoverySalt,
      recoveryWrappedVmk: d.recoveryWrappedVmk,
      recoveryWrappedVmkIv: d.recoveryWrappedVmkIv,
      emailTicketJti: null, // consume the ticket
    },
  });
  if (res.count !== 1) return error("This recovery link is invalid or has expired", 403);

  return ok({ ok: true });
}
