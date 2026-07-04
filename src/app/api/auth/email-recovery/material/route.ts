import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyRecoveryTicket } from "@/lib/recoveryTicket";
import { emailRecoveryTokenSchema } from "@/lib/validation";
import { emailRecoveryEnabled } from "@/lib/featureFlags";
import { ok, error } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";

// POST — exchange a valid (signed, unexpired, current-jti) ticket for the
// email-recovery material. Does NOT consume the ticket: the jti is burned in
// /complete, so a flaky network can't strand the user half-way.
export async function POST(req: NextRequest) {
  if (!emailRecoveryEnabled()) return error("Email recovery is currently unavailable", 503);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const limit = rateLimit(`emailmat:${ip}`, 10, 15 * 60 * 1000);
  if (!limit.ok) return error("Too many attempts. Try later.", 429);

  const body = await req.json().catch(() => null);
  const parsed = emailRecoveryTokenSchema.safeParse(body);
  if (!parsed.success) return error("Invalid payload", 422);

  const ticket = await verifyRecoveryTicket(process.env.JWT_SECRET!, parsed.data.token);
  if (!ticket) return error("This recovery link is invalid or has expired", 403);

  const user = await prisma.user.findUnique({
    where: { id: ticket.userId },
    select: { emailTicketJti: true, emailErk: true, emailWrappedVmk: true, emailWrappedVmkIv: true },
  });
  if (!user || user.emailTicketJti !== ticket.jti || !user.emailErk) {
    return error("This recovery link is invalid or has expired", 403);
  }

  return ok({
    erk: user.emailErk,
    emailWrappedVmk: user.emailWrappedVmk,
    emailWrappedVmkIv: user.emailWrappedVmkIv,
  });
}
