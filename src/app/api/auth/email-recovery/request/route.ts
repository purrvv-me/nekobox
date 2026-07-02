import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { hashEmail, createRecoveryTicket } from "@/lib/recoveryTicket";
import { sendRecoveryEmail } from "@/lib/mailer";
import { emailRecoveryRequestSchema } from "@/lib/validation";
import { ok, error } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";

function emailHashKey(): string {
  return process.env.EMAIL_HASH_KEY ?? `${process.env.JWT_SECRET}::email-hash-v1`;
}

// POST — start email recovery. Unauthenticated by nature. The response is
// IDENTICAL whether or not the email is linked (no account enumeration), and
// the expensive work (HMAC + DB lookup) runs in both branches. The recovery
// link travels ONLY via email — never in the HTTP response.
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const limit = rateLimit(`emailreq:${ip}`, 5, 15 * 60 * 1000);
  if (!limit.ok) return error("Too many attempts. Try later.", 429);

  const body = await req.json().catch(() => null);
  const parsed = emailRecoveryRequestSchema.safeParse(body);
  if (!parsed.success) return error("Invalid payload", 422);

  const recoveryEmailHash = await hashEmail(emailHashKey(), parsed.data.email);
  const user = await prisma.user.findUnique({
    where: { recoveryEmailHash },
    select: { id: true },
  });

  if (user) {
    const jti = randomUUID();
    // One valid ticket at a time: issuing a new one invalidates the previous.
    await prisma.user.update({ where: { id: user.id }, data: { emailTicketJti: jti } });
    const token = await createRecoveryTicket(process.env.JWT_SECRET!, user.id, jti);
    const base = process.env.APP_URL ?? "http://localhost:3000";
    await sendRecoveryEmail(parsed.data.email, `${base}/recover-email?token=${encodeURIComponent(token)}`);
  }

  return ok({ ok: true, message: "If that email is linked to a vault, a recovery link has been sent." });
}
