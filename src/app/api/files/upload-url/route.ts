import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { getSession } from "@/lib/auth";
import { isStorageConfigError, presignUpload } from "@/lib/storage";
import { presignSchema } from "@/lib/validation";
import { ok, error, unauthorized } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";

// Step 1 of upload: hand the browser a short-lived presigned PUT URL so the
// encrypted blob goes straight to R2 without passing through our server.
export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return unauthorized();

  // Rate limit uploads per user: 30 presigns / 5 min.
  const limit = rateLimit(`upload:${session.sub}`, 30, 5 * 60 * 1000);
  if (!limit.ok) {
    return error("Upload rate limit reached. Slow down.", 429, {
      retryAfterMs: limit.retryAfterMs,
    });
  }

  const body = await req.json().catch(() => null);
  const parsed = presignSchema.safeParse(body);
  if (!parsed.success) return error("Invalid upload request", 422);

  const maxBytes = Number(process.env.MAX_UPLOAD_BYTES ?? 104857600);
  // size here is the encrypted blob size (~ plaintext + 16-byte GCM tag).
  if (parsed.data.size > maxBytes) {
    return error(`File exceeds max size of ${maxBytes} bytes`, 413);
  }

  // Key is namespaced under the user id so ownership is verifiable at finalize.
  const storageKey = `${session.sub}/${randomUUID()}`;
  let uploadUrl: string;
  try {
    uploadUrl = await presignUpload(storageKey, "application/octet-stream", parsed.data.size);
  } catch (err) {
    if (isStorageConfigError(err)) return error((err as Error).message, 503);
    return error("Could not create upload URL", 502);
  }

  return ok({ storageKey, uploadUrl });
}
