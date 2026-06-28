import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { createFolderSchema } from "@/lib/validation";
import { ok, error, unauthorized } from "@/lib/http";

// GET /api/folders — list the caller's folders with file counts.
export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return unauthorized();

  const folders = await prisma.folder.findMany({
    where: { ownerId: session.sub },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      encName: true,
      encNameIv: true,
      createdAt: true,
      _count: { select: { files: true } },
    },
  });

  return ok({
    folders: folders.map((f) => ({
      id: f.id,
      encName: f.encName,
      encNameIv: f.encNameIv,
      createdAt: f.createdAt,
      fileCount: f._count.files,
    })),
  });
}

// POST /api/folders — create a folder (name is encrypted client-side).
export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return unauthorized();

  const body = await req.json().catch(() => null);
  const parsed = createFolderSchema.safeParse(body);
  if (!parsed.success) return error("Invalid folder payload", 422);

  const folder = await prisma.folder.create({
    data: {
      ownerId: session.sub,
      encName: parsed.data.encName,
      encNameIv: parsed.data.encNameIv,
    },
    select: { id: true, createdAt: true },
  });

  return ok({ id: folder.id, createdAt: folder.createdAt }, { status: 201 });
}
