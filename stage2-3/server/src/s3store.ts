// Generic S3-compatible object store wrapper — no env-var access here, just
// explicit config in, so the SAME implementation backs:
//   • the live blob store (src/b2.ts, configured from B2_* env vars)
//   • the backup script's source AND destination (scripts/backup.ts), which
//     may point at the same bucket, a second bucket, or an entirely different
//     S3-compatible provider.
//
// Works against Backblaze B2, Cloudflare R2, AWS S3, or MinIO — anything
// speaking the S3 API.

import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

export interface S3StoreConfig {
  endpoint: string;
  region?: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export class S3Store {
  readonly bucket: string;
  private client: S3Client;

  constructor(cfg: S3StoreConfig) {
    this.bucket = cfg.bucket;
    this.client = new S3Client({
      region: cfg.region || "us-east-1",
      endpoint: cfg.endpoint,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    });
  }

  /**
   * Upload a stream of UNKNOWN length (e.g. an Express request body). Uses the
   * SDK's multipart-aware Upload helper rather than a single PutObjectCommand,
   * which would require a pre-known Content-Length. Returns the object's real
   * stored size (via HeadObject) — "trust storage, not the client".
   */
  async putStream(key: string, body: Readable, contentType?: string): Promise<number> {
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType ?? "application/octet-stream",
      },
      queueSize: 4,
      partSize: 8 * 1024 * 1024, // 8 MiB parts
    });
    await upload.done();
    const head = await this.head(key);
    if (!head) throw new Error(`Upload for "${key}" reported done but HeadObject found nothing`);
    return head.size;
  }

  /** Fetch an object as a Node Readable, for piping straight into an HTTP response. */
  async getStream(key: string): Promise<Readable> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!(res.Body instanceof Readable)) throw new Error(`Unexpected response body type for "${key}"`);
    return res.Body;
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async head(key: string): Promise<{ size: number } | null> {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: Number(res.ContentLength ?? 0) };
    } catch {
      return null;
    }
  }

  /** List every object under an optional key prefix (paginated). */
  async *list(prefix = ""): AsyncGenerator<{ key: string; size: number }> {
    let ContinuationToken: string | undefined;
    do {
      const res = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken }),
      );
      for (const obj of res.Contents ?? []) {
        if (obj.Key) yield { key: obj.Key, size: Number(obj.Size ?? 0) };
      }
      ContinuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (ContinuationToken);
  }

  /**
   * Immediate "subfolder" names under a prefix (delimited listing) — used to
   * enumerate timestamped backup snapshots stored as `<prefix>/<timestamp>/...`.
   */
  async listCommonPrefixes(prefix: string): Promise<string[]> {
    const base = prefix.endsWith("/") ? prefix : `${prefix}/`;
    const out: string[] = [];
    let ContinuationToken: string | undefined;
    do {
      const res = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: base, Delimiter: "/", ContinuationToken }),
      );
      for (const p of res.CommonPrefixes ?? []) {
        if (p.Prefix) out.push(p.Prefix.slice(base.length).replace(/\/$/, ""));
      }
      ContinuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (ContinuationToken);
    return out;
  }

  /** Delete every object under a prefix (used when pruning an old snapshot). */
  async deletePrefix(prefix: string): Promise<number> {
    let count = 0;
    for await (const { key } of this.list(prefix)) {
      await this.delete(key);
      count++;
    }
    return count;
  }
}
