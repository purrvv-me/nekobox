import "server-only";
import { S3Client, DeleteObjectCommand, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Cloudflare R2 is S3-compatible. The bucket MUST be private — clients only
// ever touch it through short-lived signed URLs generated here on the server.

function endpoint(): string {
  if (process.env.R2_ENDPOINT) return process.env.R2_ENDPOINT;
  const account = process.env.R2_ACCOUNT_ID;
  if (!account) throw new Error("R2_ACCOUNT_ID (or R2_ENDPOINT) must be set.");
  return `https://${account}.r2.cloudflarestorage.com`;
}

let _client: S3Client | null = null;
function client(): S3Client {
  if (_client) return _client;
  _client = new S3Client({
    region: "auto",
    endpoint: endpoint(),
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
  return _client;
}

function bucket(): string {
  const b = process.env.R2_BUCKET;
  if (!b) throw new Error("R2_BUCKET must be set.");
  return b;
}

const SIGN_TTL = 300; // 5 minutes — long enough to up/download, short enough to be safe.

/** Presigned PUT URL the browser uses to upload an encrypted blob directly. */
export async function presignUpload(storageKey: string, contentType: string, maxBytes: number) {
  const cmd = new PutObjectCommand({
    Bucket: bucket(),
    Key: storageKey,
    ContentType: contentType,
    ContentLength: maxBytes, // enforced server-side by R2
  });
  return getSignedUrl(client(), cmd, { expiresIn: SIGN_TTL });
}

/** Presigned GET URL the browser uses to download an encrypted blob. */
export async function presignDownload(storageKey: string) {
  const cmd = new GetObjectCommand({ Bucket: bucket(), Key: storageKey });
  return getSignedUrl(client(), cmd, { expiresIn: SIGN_TTL });
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
