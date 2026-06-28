import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { presignDownload } from "@/lib/storage";
import { ok, unauthorized, notFound, forbidden } from "@/lib/http";

// GET /api/share/:id — recipient fetches a signed download URL + the crypto
// metadata needed to decrypt a file shared with them.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return unauthorized();

  const share = await prisma.share.findUnique({
    where: { id: params.id },
    select: {
      toUserId: true,
      rsaWrappedDek: true,
      file: { select: { storageKey: true, mimeType: true, contentIv: true, chunkSize: true } },
    },
  });
  if (!share) return notFound("Share");
  if (share.toUserId !== session.sub) return forbidden();

  const url = await presignDownload(share.file.storageKey);
  return ok({
    url,
    mimeType: share.file.mimeType,
    contentIv: share.file.contentIv,
    chunkSize: share.file.chunkSize,
    rsaWrappedDek: share.rsaWrappedDek,
  });
}

// DELETE /api/share/:id — revoke. The sharer (owner) OR the recipient may
// remove the share relationship.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return unauthorized();

  const share = await prisma.share.findUnique({
    where: { id: params.id },
    select: { fromUserId: true, toUserId: true },
  });
  if (!share) return notFound("Share");
  if (share.fromUserId !== session.sub && share.toUserId !== session.sub) {
    return forbidden();
  }

  await prisma.share.delete({ where: { id: params.id } });
  return ok({ ok: true });
}
