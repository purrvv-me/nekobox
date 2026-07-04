// Dumb persistence: encrypted blobs + opaque metadata in a JSON file. The
// server never inspects blob contents and stores no secrets — only a vault's
// PUBLIC auth key, plus per-file metadata (encrypted name, size, time).
//
// Blob bodies live in Backblaze B2 (S3-compatible) when B2_* env vars are
// configured — see src/b2.ts — with local disk as the ONLY-for-development
// fallback when they aren't. Metadata (meta.json) always lives on local disk
// regardless of where blob bodies live; it's tiny, and moving it to object
// storage would add latency/cost for no benefit at this scale.

import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open as fsOpen, readFile, rm, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import { isB2Configured, b2Store } from "./b2.js";

const DATA_DIR = fileURLToPath(new URL("../data", import.meta.url));
const BLOB_DIR = join(DATA_DIR, "blobs");
const META_FILE = join(DATA_DIR, "meta.json");
const LOCK_FILE = join(DATA_DIR, "meta.lock");

export interface VaultRecord {
  authPublicKey: string; // base64 SPKI of an ECDSA P-256 public key (NOT a secret)
  createdAt: number;
}
export interface FileMeta {
  id: string;
  vaultId: string;
  encName: string; // opaque: client-encrypted file name
  size: number; // encrypted blob size in bytes
  createdAt: number;
}
export interface ShareMeta {
  id: string; // server-generated UUID
  vaultId: string; // owner (for listing/revoke) — recipients stay anonymous
  encName: string; // name sealed under the SHARE key (owner uploads it; server can't read)
  ownerLabel: string; // name sealed under the OWNER's master key (for the owner's list)
  size: number;
  createdAt: number;
  expiresAt: number | null; // null = never
  maxOpens: number | null; // null = unlimited
  opens: number;
}
interface DB {
  vaults: Record<string, VaultRecord>;
  files: Record<string, FileMeta>;
  shares: Record<string, ShareMeta>;
}

// Blobs for shares live under a fixed server-controlled namespace.
const SHARE_NS = "__shares__";

let db: DB = { vaults: {}, files: {}, shares: {} };

export async function initStore(): Promise<void> {
  await mkdir(BLOB_DIR, { recursive: true });
  try {
    db = JSON.parse(await readFile(META_FILE, "utf8"));
    db.vaults ??= {};
    db.files ??= {};
    db.shares ??= {};
  } catch {
    db = { vaults: {}, files: {}, shares: {} };
    await persist();
  }
}

async function persist(): Promise<void> {
  await writeFile(META_FILE, JSON.stringify(db, null, 2));
}

async function reload(): Promise<void> {
  try {
    db = JSON.parse(await readFile(META_FILE, "utf8"));
    db.vaults ??= {};
    db.files ??= {};
    db.shares ??= {};
  } catch {
    /* keep current in-memory state if the file isn't readable */
  }
}

// Serialize a critical section both in-process (a promise chain) and across
// processes sharing this data dir (an exclusive O_CREAT|O_EXCL lock file). Used
// to make one-time share-open consumption atomic even under concurrent /
// multi-instance requests — without swapping the JSON store for a real DB.
let lockChain: Promise<unknown> = Promise.resolve();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = lockChain.then(() => fileLocked(fn));
  lockChain = run.catch(() => {});
  return run;
}

async function fileLocked<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let handle;
    try {
      handle = await fsOpen(LOCK_FILE, "wx"); // fails if the lock already exists
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      if (attempt > 400) throw new Error("store lock timeout");
      await sleep(10);
      continue;
    }
    try {
      return await fn();
    } finally {
      await handle.close();
      await rm(LOCK_FILE, { force: true });
    }
  }
}

// ─── vaults (public key only) ─────────────────────────────────────────
export function getVault(vaultId: string): VaultRecord | undefined {
  return db.vaults[vaultId];
}
export async function createVault(vaultId: string, authPublicKey: string): Promise<VaultRecord> {
  const rec: VaultRecord = { authPublicKey, createdAt: Date.now() };
  db.vaults[vaultId] = rec;
  await persist();
  return rec;
}

// ─── file metadata ────────────────────────────────────────────────────
export function listFiles(vaultId: string): FileMeta[] {
  return Object.values(db.files)
    .filter((f) => f.vaultId === vaultId)
    .sort((a, b) => b.createdAt - a.createdAt);
}
export function getFile(id: string): FileMeta | undefined {
  return db.files[id];
}
export async function addFile(vaultId: string, encName: string, size: number): Promise<FileMeta> {
  const meta: FileMeta = { id: randomUUID(), vaultId, encName, size, createdAt: Date.now() };
  db.files[meta.id] = meta;
  await persist();
  return meta;
}
export async function renameFile(id: string, encName: string): Promise<void> {
  db.files[id].encName = encName;
  await persist();
}
export async function setFileSize(id: string, size: number): Promise<void> {
  db.files[id].size = size;
  await persist();
}
export async function deleteFileMeta(id: string): Promise<void> {
  delete db.files[id];
  await persist();
}

// Total encrypted bytes a vault is using (files + shares) — for quota checks.
export function vaultUsage(vaultId: string): number {
  let total = 0;
  for (const f of Object.values(db.files)) if (f.vaultId === vaultId) total += f.size;
  for (const s of Object.values(db.shares)) if (s.vaultId === vaultId) total += s.size;
  return total;
}

// ─── shares ───────────────────────────────────────────────────────────
export function getShare(id: string): ShareMeta | undefined {
  return db.shares[id];
}
export function listShares(vaultId: string): ShareMeta[] {
  return Object.values(db.shares)
    .filter((s) => s.vaultId === vaultId)
    .sort((a, b) => b.createdAt - a.createdAt);
}
export async function addShare(
  vaultId: string,
  encName: string,
  ownerLabel: string,
  expiresAt: number | null,
  maxOpens: number | null,
): Promise<ShareMeta> {
  const meta: ShareMeta = {
    id: randomUUID(),
    vaultId,
    encName,
    ownerLabel,
    size: 0,
    createdAt: Date.now(),
    expiresAt,
    maxOpens,
    opens: 0,
  };
  db.shares[meta.id] = meta;
  await persist();
  return meta;
}
export async function setShareSize(id: string, size: number): Promise<void> {
  db.shares[id].size = size;
  await persist();
}
/**
 * Atomically consume one open. Returns false if the limit is already reached.
 * Runs inside a cross-process file lock and re-reads the metadata from disk, so
 * a one-time link can't be spent twice by concurrent or multi-instance requests.
 */
export async function consumeShareOpen(id: string): Promise<boolean> {
  return withLock(async () => {
    await reload(); // pick up writes from other processes before deciding
    const s = db.shares[id];
    if (!s) return false;
    if (s.maxOpens !== null && s.opens >= s.maxOpens) return false;
    s.opens += 1;
    await persist();
    return true;
  });
}
export async function deleteShare(id: string): Promise<void> {
  delete db.shares[id];
  await deleteBlob(SHARE_NS, id);
  await persist();
}
export function shareBlobStream(id: string): Promise<Readable> {
  return readBlob(SHARE_NS, id);
}
export function writeShareBlob(id: string, source: Readable): Promise<number> {
  return writeBlob(SHARE_NS, id, source);
}
/** Remove expired shares (blob + metadata). Called periodically. */
export async function sweepShares(): Promise<void> {
  const now = Date.now();
  for (const s of Object.values(db.shares)) {
    if (s.expiresAt !== null && s.expiresAt < now) await deleteShare(s.id);
  }
}

// ─── blobs — B2 (primary, when configured) or local disk (dev fallback) ──
// The same logical key (`<vaultId>/<fileId>`, or `__shares__/<shareId>`) is
// used as an S3 object key on B2 and as a relative filesystem path locally,
// so nothing above this layer needs to know which backend is active.
function blobKey(vaultId: string, fileId: string): string {
  return `${vaultId}/${fileId}`; // literal "/" — an S3 key, not a filesystem path
}
function blobPath(vaultId: string, fileId: string): string {
  return join(BLOB_DIR, vaultId, fileId);
}

export async function writeBlob(vaultId: string, fileId: string, source: Readable): Promise<number> {
  if (isB2Configured()) return b2Store().putStream(blobKey(vaultId, fileId), source);

  const p = blobPath(vaultId, fileId);
  await mkdir(dirname(p), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const out = createWriteStream(p);
    source.pipe(out);
    source.on("error", reject);
    out.on("error", reject);
    out.on("finish", resolve);
  });
  return (await stat(p)).size;
}

export async function readBlob(vaultId: string, fileId: string): Promise<Readable> {
  if (isB2Configured()) return b2Store().getStream(blobKey(vaultId, fileId));
  return createReadStream(blobPath(vaultId, fileId));
}

export async function deleteBlob(vaultId: string, fileId: string): Promise<void> {
  if (isB2Configured()) {
    await b2Store()
      .delete(blobKey(vaultId, fileId))
      .catch(() => {}); // idempotent, like the local rm({force:true}) below
    return;
  }
  await rm(blobPath(vaultId, fileId), { force: true });
}
