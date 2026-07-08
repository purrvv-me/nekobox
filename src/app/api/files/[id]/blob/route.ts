import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getObject, isStorageConfigError } from "@/lib/storage";
import { error, forbidden, notFound, unauthorized } from "@/lib/http";

type FileBlobRouteContext = { params: Promise<{ id: string }> };

// Same-origin fallback for encrypted blob download. This avoids browser CORS
// dependency on B2/R2 while preserving zero-knowledge: the response body is
// still ciphertext and is decrypted only in the browser.
export async function GET(req: NextRequest, { params }: FileBlobRouteContext) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  const { id } = await params;

  const file = await prisma.file.findUnique({
    where: { id },
    select: { ownerId: true, storageKey: true },
  });
  if (!file) return notFound("File");
  if (file.ownerId !== session.sub) return forbidden();

  let body: Uint8Array | null;
  try {
    body = await getObject(file.storageKey);
  } catch (err) {
    if (isStorageConfigError(err)) return error((err as Error).message, 503);
    return error("Could not fetch encrypted blob from storage", 502);
  }
  if (!body) return notFound("Encrypted blob");
  const responseBody = new ArrayBuffer(body.byteLength);
  new Uint8Array(responseBody).set(body);

  return new Response(responseBody, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(body.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
