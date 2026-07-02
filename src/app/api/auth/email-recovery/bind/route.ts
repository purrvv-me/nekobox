import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { hashEmail } from "@/lib/recoveryTicket";
import { emailRecoveryBindSchema } from "@/lib/validation";
import { ok, error, unauthorized } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";

function emailHashKey(): string {
  // Separate key from anything file-encryption related (those keys never exist
  // server-side). Falls back to a labelled derivation of JWT_SECRET.
  return process.env.EMAIL_HASH_KEY ?? `${process.env.JWT_SECRET}::email-hash-v1`;
}

// POST — link an email for recovery. Requires an ACTIVE session (the user has
// already unlocked; the ERK material is produced client-side from the VMK).
export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return unauthorized();

  const limit = rateLimit(`emailbind:${session.sub}`, 5, 15 * 60 * 1000);
  if (!limit.ok) return error("Too many attempts. Try later.", 429);

  const body = await req.json().catch(() => null);
  const parsed = emailRecoveryBindSchema.safeParse(body);
  if (!parsed.success) return error("Invalid payload", 422);
  const d = parsed.data;

  const recoveryEmailHash = await hashEmail(emailHashKey(), d.email);

  // The hash is unique — refuse if another account already linked this email.
  const clash = await prisma.user.findUnique({ where: { recoveryEmailHash }, select: { id: true } });
  if (clash && clash.id !== session.sub) return error("That email is already linked to another vault", 409);

  await prisma.user.update({
    where: { id: session.sub },
    data: {
      recoveryEmailHash,
      emailErk: d.erk,
      emailWrappedVmk: d.emailWrappedVmk,
      emailWrappedVmkIv: d.emailWrappedVmkIv,
      emailTicketJti: null,
    },
  });
  return ok({ ok: true });
}

// DELETE — unlink email recovery entirely.
export async function DELETE(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return unauthorized();

  await prisma.user.update({
    where: { id: session.sub },
    data: {
      recoveryEmailHash: null,
      emailErk: null,
      emailWrappedVmk: null,
      emailWrappedVmkIv: null,
      emailTicketJti: null,
    },
  });
  return ok({ ok: true });
}
