import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { ok, error, unauthorized, forbidden } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";
import { isStorageConfigError, putObject } from "@/lib/storage";
import { storageKeySchema } from "@/lib/validation";

// Same-origin fallback for encrypted blob upload. The preferred path is still
// a direct browser PUT to the presigned B2/R2 URL, but some buckets block that
// with CORS. This endpoint never sees plaintext: the body is already encrypted
// in the browser before it is sent here.
export async function PUT(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return unauthorized();

  const limit = rateLimit(`upload-body:${session.sub}`, 30, 5 * 60 * 1000);
  if (!limit.ok) {
    return error("Upload rate limit reached. Slow down.", 429, {
      retryAfterMs: limit.retryAfterMs,
    });
  }

  const storageKey = req.headers.get("x-nekobox-storage-key") ?? "";
  const parsedKey = storageKeySchema.safeParse(storageKey);
  if (!parsedKey.success) return error("Invalid storage key", 422);
  if (!parsedKey.data.startsWith(`${session.sub}/`)) return forbidden();

  const maxBytes = Number(process.env.MAX_UPLOAD_BYTES ?? 104857600);
  const declaredLength = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return error(`File exceeds max size of ${maxBytes} bytes`, 413);
  }

  const body = new Uint8Array(await req.arrayBuffer());
  if (body.byteLength > maxBytes) {
    return error(`File exceeds max size of ${maxBytes} bytes`, 413);
  }

  try {
    await putObject(parsedKey.data, body, "application/octet-stream");
  } catch (err) {
    if (isStorageConfigError(err)) return error((err as Error).message, 503);
    return error("Could not upload encrypted blob to storage", 502);
  }

  return ok({ ok: true });
}
