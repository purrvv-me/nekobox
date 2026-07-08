import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { deleteObject, headObject, isStorageConfigError } from "@/lib/storage";
import { finalizeFileSchema } from "@/lib/validation";
import { ok, error, unauthorized, forbidden } from "@/lib/http";

// GET /api/files — list the caller's own vault.
export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return unauthorized();

  const files = await prisma.file.findMany({
    where: { ownerId: session.sub },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      encName: true,
      encNameIv: true,
      mimeType: true,
      size: true,
      createdAt: true,
      wrappedDek: true,
      wrappedDekIv: true,
      contentIv: true,
      chunkSize: true,
      folderId: true,
    },
  });
  return ok({ files });
}

// POST /api/files — step 2 of upload: persist metadata after the blob landed
// in R2. We confirm the object exists and is owned by this user.
export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return unauthorized();

  const body = await req.json().catch(() => null);
  const parsed = finalizeFileSchema.safeParse(body);
  if (!parsed.success) return error("Invalid file metadata", 422);

  const d = parsed.data;

  // The storageKey must be one we issued to THIS user (prefix = userId).
  if (!d.storageKey.startsWith(`${session.sub}/`)) return forbidden();

  // If a folder was given, confirm it belongs to this user.
  if (d.folderId) {
    const folder = await prisma.folder.findUnique({
      where: { id: d.folderId },
      select: { ownerId: true },
    });
    if (!folder || folder.ownerId !== session.sub) return forbidden();
  }

  let head: { size: number } | null;
  try {
    head = await headObject(d.storageKey);
  } catch (err) {
    if (isStorageConfigError(err)) return error((err as Error).message, 503);
    return error("Could not verify uploaded object", 502);
  }
  if (!head) return error("Uploaded object not found in storage", 409);

  const maxBytes = Number(process.env.MAX_UPLOAD_BYTES ?? 104857600);
  if (head.size > maxBytes) {
    await deleteObject(d.storageKey).catch(() => {});
    return error(`File exceeds max size of ${maxBytes} bytes`, 413);
  }

  // Enforce a per-user storage quota (counts encrypted blob sizes).
  const quota = Number(process.env.MAX_VAULT_BYTES ?? 15 * 1024 * 1024 * 1024);
  const agg = await prisma.file.aggregate({
    where: { ownerId: session.sub },
    _sum: { size: true },
  });
  if ((agg._sum.size ?? 0) + head.size > quota) {
    await deleteObject(d.storageKey).catch(() => {});
    return error("Vault storage quota exceeded", 413);
  }

  try {
    const file = await prisma.file.create({
      data: {
        ownerId: session.sub,
        storageKey: d.storageKey,
        folderId: d.folderId ?? null,
        encName: d.encName,
        encNameIv: d.encNameIv,
        mimeType: d.mimeType,
        size: head.size, // trust storage, not the client, for size
        wrappedDek: d.wrappedDek,
        wrappedDekIv: d.wrappedDekIv,
        contentIv: d.contentIv,
        chunkSize: d.chunkSize,
      },
      select: { id: true, createdAt: true },
    });
    return ok({ id: file.id, createdAt: file.createdAt }, { status: 201 });
  } catch {
    // Orphan cleanup: if metadata fails, don't leave a dangling blob.
    await deleteObject(d.storageKey).catch(() => {});
    return error("Could not save file metadata", 500);
  }
}
