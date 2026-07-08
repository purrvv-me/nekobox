import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { updateFolderSchema } from "@/lib/validation";
import { ok, error, unauthorized, notFound, forbidden } from "@/lib/http";

// PATCH /api/folders/:id — rename a folder (name encrypted client-side).
type FolderRouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: FolderRouteContext) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = updateFolderSchema.safeParse(body);
  if (!parsed.success) return error("Invalid update payload", 422);

  const folder = await prisma.folder.findUnique({
    where: { id },
    select: { ownerId: true },
  });
  if (!folder) return notFound("Folder");
  if (folder.ownerId !== session.sub) return forbidden();

  await prisma.folder.update({
    where: { id },
    data: { encName: parsed.data.encName, encNameIv: parsed.data.encNameIv },
  });
  return ok({ ok: true });
}

// DELETE /api/folders/:id — remove a folder. Its files are NOT deleted; the
// onDelete: SetNull relation moves them back to the vault root.
export async function DELETE(req: NextRequest, { params }: FolderRouteContext) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  const { id } = await params;

  const folder = await prisma.folder.findUnique({
    where: { id },
    select: { ownerId: true },
  });
  if (!folder) return notFound("Folder");
  if (folder.ownerId !== session.sub) return forbidden();

  await prisma.folder.delete({ where: { id } });
  return ok({ ok: true });
}
