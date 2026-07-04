// Resolves the LIVE blob store (B2 bucket or local disk — whatever store.ts
// is actually using) and the BACKUP destination (a bucket or a local folder)
// from environment variables, for the backup/restore scripts.

import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isB2Configured, b2Config } from "../src/b2.js";
import { S3Store, type S3StoreConfig } from "../src/s3store.js";
import { LocalBlobStore } from "./localBlobStore.js";
import { S3BlobStore } from "./s3BlobStore.js";
import type { BlobDestination, BlobSource } from "./snapshotCore.js";

const SERVER_ROOT = fileURLToPath(new URL("..", import.meta.url));
export const DEFAULT_DATA_DIR = join(SERVER_ROOT, "data");
export const DEFAULT_BACKUP_ROOT = join(SERVER_ROOT, "backups");
export const DEFAULT_RETENTION = 7;

export function dataDir(): string {
  return process.env.DATA_DIR ?? DEFAULT_DATA_DIR;
}
export function metaFile(): string {
  return join(dataDir(), "meta.json");
}
export function backupRetention(): number {
  const n = Number(process.env.BACKUP_RETENTION ?? DEFAULT_RETENTION);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_RETENTION;
}

export interface ResolvedStore {
  store: BlobSource & BlobDestination;
  /** Human-readable label for log output. */
  label: string;
}

/**
 * The LIVE blob store — same rule store.ts uses: B2 when configured, else the
 * local `data/blobs` directory (dev fallback). This is the backup SOURCE and
 * the restore DESTINATION.
 */
export function liveStore(): ResolvedStore {
  if (isB2Configured()) {
    return { store: new S3BlobStore(new S3Store(b2Config())), label: `B2 bucket "${b2Config().bucket}"` };
  }
  const dir = join(dataDir(), "blobs");
  return { store: new LocalBlobStore(dir), label: `local directory "${dir}"` };
}

export interface ResolvedBackupTarget extends ResolvedStore {
  /** Root prefix under which timestamped snapshot groups live. "" for local. */
  prefix: string;
}

/**
 * The BACKUP destination/source: a bucket if BACKUP_S3_BUCKET is set
 * (reusing B2_* credentials unless BACKUP_S3_* overrides are given — the
 * "second bucket, same account" case), otherwise a local folder
 * (BACKUP_DIR, default server/backups).
 */
export function backupTarget(): ResolvedBackupTarget {
  const bucket = process.env.BACKUP_S3_BUCKET;
  if (bucket) {
    const cfg: S3StoreConfig = {
      bucket,
      endpoint: requireOneOf("BACKUP_S3_ENDPOINT", "B2_ENDPOINT"),
      region: process.env.BACKUP_S3_REGION || process.env.B2_REGION || "us-west-004",
      accessKeyId: requireOneOf("BACKUP_S3_ACCESS_KEY_ID", "B2_ACCESS_KEY_ID"),
      secretAccessKey: requireOneOf("BACKUP_S3_SECRET_ACCESS_KEY", "B2_SECRET_ACCESS_KEY"),
    };
    const prefix = process.env.BACKUP_S3_PREFIX ?? "nekobox-backups";
    return { store: new S3BlobStore(new S3Store(cfg)), label: `S3 bucket "${bucket}" (prefix "${prefix}")`, prefix };
  }
  const dir = process.env.BACKUP_DIR ?? DEFAULT_BACKUP_ROOT;
  return { store: new LocalBlobStore(dir), label: `local directory "${dir}"`, prefix: "" };
}

function requireOneOf(primary: string, fallback: string): string {
  const v = process.env[primary] || process.env[fallback];
  if (!v) {
    throw new Error(
      `Set ${primary} (or ${fallback}, to reuse your primary storage credentials for a second bucket) ` +
        `when BACKUP_S3_BUCKET is set.`,
    );
  }
  return v;
}
