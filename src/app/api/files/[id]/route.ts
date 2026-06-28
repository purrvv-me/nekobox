import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { presignDownload, deleteObject } from "@/lib/storage";
import { updateFileSchema } from "@/lib/validation";
import { ok, error, unauthorized, notFound, forbidden } from "@/lib/http";

// GET /api/files/:id — issue a signed download URL + the crypto metadata the
// owner needs to decrypt locally.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return unauthorized();

  const file = await prisma.file.findUnique({
    where: { id: params.id },
    select: {
      ownerId: true,
      storageKey: true,
      mimeType: true,
      wrappedDek: true,
      wrappedDekIv: true,
      contentIv: true,
      chunkSize: true,
    },
  });
  if (!file) return notFound("File");
  if (file.ownerId !== session.sub) return forbidden();

  const url = await presignDownload(file.storageKey);
  return ok({
    url,
    mimeType: file.mimeType,
    wrappedDek: file.wrappedDek,
    wrappedDekIv: file.wrappedDekIv,
    contentIv: file.contentIv,
    chunkSize: file.chunkSize,
  });
}

// PATCH /api/files/:id — rename (encName) and/or move (folderId).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return unauthorized();

  const body = await req.json().catch(() => null);
  const parsed = updateFileSchema.safeParse(body);
  if (!parsed.success) return error("Invalid update payload", 422);
  const d = parsed.data;

  const file = await prisma.file.findUnique({
    where: { id: params.id },
    select: { ownerId: true },
  });
  if (!file) return notFound("File");
  if (file.ownerId !== session.sub) return forbidden();

  // When moving into a folder, verify it belongs to this user.
  if (d.folderId) {
    const folder = await prisma.folder.findUnique({
      where: { id: d.folderId },
      select: { ownerId: true },
    });
    if (!folder || folder.ownerId !== session.sub) return forbidden();
  }

  await prisma.file.update({
    where: { id: params.id },
    data: {
      ...(d.encName !== undefined ? { encName: d.encName, encNameIv: d.encNameIv } : {}),
      ...(d.folderId !== undefined ? { folderId: d.folderId } : {}),
    },
  });

  return ok({ ok: true });
}

// DELETE /api/files/:id — remove from R2 and DB (cascades shares).
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return unauthorized();

  const file = await prisma.file.findUnique({
    where: { id: params.id },
    select: { ownerId: true, storageKey: true },
  });
  if (!file) return notFound("File");
  if (file.ownerId !== session.sub) return forbidden();

  await deleteObject(file.storageKey).catch(() => {});
  await prisma.file.delete({ where: { id: params.id } });

  return ok({ ok: true });
}
