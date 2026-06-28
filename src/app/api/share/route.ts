import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { shareSchema } from "@/lib/validation";
import { ok, error, unauthorized, notFound, forbidden } from "@/lib/http";

// POST /api/share — share one of my files with another user.
// The client has already unwrapped the DEK with its master key and re-wrapped
// it with the recipient's RSA public key, so the server only stores ciphertext.
export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return unauthorized();

  const body = await req.json().catch(() => null);
  const parsed = shareSchema.safeParse(body);
  if (!parsed.success) return error("Invalid share payload", 422);

  const { fileId, toEmail, rsaWrappedDek, encName, encNameIv } = parsed.data;

  const file = await prisma.file.findUnique({
    where: { id: fileId },
    select: { ownerId: true },
  });
  if (!file) return notFound("File");
  if (file.ownerId !== session.sub) return forbidden();

  const recipient = await prisma.user.findUnique({
    where: { email: toEmail },
    select: { id: true },
  });
  if (!recipient) return notFound("Recipient");
  if (recipient.id === session.sub) return error("You cannot share with yourself", 400);

  // Upsert so re-sharing just refreshes the wrapped key.
  const share = await prisma.share.upsert({
    where: { fileId_toUserId: { fileId, toUserId: recipient.id } },
    create: {
      fileId,
      fromUserId: session.sub,
      toUserId: recipient.id,
      rsaWrappedDek,
      encName,
      encNameIv,
    },
    update: { rsaWrappedDek, encName, encNameIv, fromUserId: session.sub },
    select: { id: true, createdAt: true },
  });

  return ok({ id: share.id, createdAt: share.createdAt }, { status: 201 });
}

// GET /api/share — files shared WITH me.
export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return unauthorized();

  const shares = await prisma.share.findMany({
    where: { toUserId: session.sub },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      rsaWrappedDek: true,
      encName: true,
      encNameIv: true,
      createdAt: true,
      fromUser: { select: { email: true } },
      file: { select: { mimeType: true, size: true, contentIv: true } },
    },
  });

  return ok({
    shares: shares.map((s) => ({
      id: s.id,
      rsaWrappedDek: s.rsaWrappedDek,
      encName: s.encName,
      encNameIv: s.encNameIv,
      createdAt: s.createdAt,
      fromEmail: s.fromUser.email,
      mimeType: s.file.mimeType,
      size: s.file.size,
      contentIv: s.file.contentIv,
    })),
  });
}
