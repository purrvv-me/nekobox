import "server-only";
import { S3Client, DeleteObjectCommand, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Backblaze B2 is S3-compatible, same shape as ./r2.ts (Cloudflare R2) — just
// a different endpoint convention (B2 needs an explicit region + endpoint,
// e.g. https://s3.us-west-004.backblazeb2.com, rather than R2's
// account-id-derived one). The bucket MUST be private; clients only ever
// touch it through short-lived signed URLs generated here on the server.

function endpoint(): string {
  const e = process.env.B2_ENDPOINT;
  if (!e) throw new Error("B2_ENDPOINT must be set.");
  return e;
}

let _client: S3Client | null = null;
function client(): S3Client {
  if (_client) return _client;
  _client = new S3Client({
    region: process.env.B2_REGION || "us-west-004",
    endpoint: endpoint(),
    credentials: {
      accessKeyId: process.env.B2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.B2_SECRET_ACCESS_KEY!,
    },
  });
  return _client;
}

function bucket(): string {
  const b = process.env.B2_BUCKET ?? process.env.B2_BUCKET_NAME;
  if (!b) throw new Error("B2_BUCKET must be set.");
  return b;
}

const SIGN_TTL = 300; // 5 minutes — long enough to up/download, short enough to be safe.

/**
 * Presigned PUT URL the browser uses to upload an encrypted blob directly.
 * We deliberately do NOT bind Content-Type or Content-Length into the signature:
 * doing so makes them *signed headers* the browser must reproduce byte-for-byte,
 * but the client sends a fixed `application/octet-stream` and the real body
 * length, which wouldn't match — S3/B2 then rejects the PUT with 403. The blob
 * is opaque ciphertext, so its stored content-type is irrelevant, and upload
 * size is validated separately when the file record is persisted.
 */
export async function presignUpload(storageKey: string, _contentType: string, _maxBytes: number) {
  const cmd = new PutObjectCommand({ Bucket: bucket(), Key: storageKey });
  return getSignedUrl(client(), cmd, { expiresIn: SIGN_TTL });
}

/** Server-side fallback upload for browsers blocked by bucket CORS. */
export async function putObject(storageKey: string, body: Uint8Array, contentType = "application/octet-stream") {
  await client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: storageKey,
      Body: body,
      ContentLength: body.byteLength,
      ContentType: contentType,
    }),
  );
}

/** Presigned GET URL the browser uses to download an encrypted blob. */
export async function presignDownload(storageKey: string) {
  const cmd = new GetObjectCommand({ Bucket: bucket(), Key: storageKey });
  return getSignedUrl(client(), cmd, { expiresIn: SIGN_TTL });
}

export async function getObject(storageKey: string): Promise<Uint8Array | null> {
  try {
    const res = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: storageKey }));
    return (await res.Body?.transformToByteArray()) ?? null;
  } catch {
    return null;
  }
}

export async function deleteObject(storageKey: string) {
  await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: storageKey }));
}

/** Confirm an object exists and read its real size (used after upload). */
export async function headObject(storageKey: string): Promise<{ size: number } | null> {
  try {
    const res = await client().send(new HeadObjectCommand({ Bucket: bucket(), Key: storageKey }));
    return { size: Number(res.ContentLength ?? 0) };
  } catch {
    return null;
  }
}
