// Backup/restore smoke test.
//   1. Pure orchestration logic (syncAll, groupsToPrune, pruneOldGroups)
//      against FAKE in-memory source/destination — no filesystem or network.
//   2. Integration test of the actual local-disk adapter (LocalBlobStore),
//      end to end, exercising the real code paths runBackup()/restoreSnapshot()
//      use when B2 isn't configured (the dev fallback).
//
// Run with: npx tsx test/backup.smoke.ts
// (B2-backed paths aren't exercised here — they'd need real credentials —
// but the S3BlobStore adapter is a thin, directly-inspectable wrapper around
// the same S3Store class the orchestration tests below don't need to know
// anything about, by design.)

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import {
  groupsToPrune,
  pruneOldGroups,
  syncAll,
  timestamp,
  type BlobDestination,
  type BlobEntry,
  type BlobSource,
} from "../scripts/snapshotCore.js";
import { LocalBlobStore } from "../scripts/localBlobStore.js";

// ─── 1. Pure orchestration against in-memory fakes ────────────────────
class FakeStore implements BlobSource, BlobDestination {
  files = new Map<string, Buffer>();

  async *list(prefix = ""): AsyncIterable<BlobEntry> {
    for (const [key, buf] of this.files) {
      if (key.startsWith(prefix)) yield { key, size: buf.length };
    }
  }
  async get(key: string): Promise<Readable> {
    const buf = this.files.get(key);
    if (!buf) throw new Error(`not found: ${key}`);
    return Readable.from(buf);
  }
  async put(key: string, body: Readable): Promise<number> {
    const chunks: Buffer[] = [];
    for await (const c of body) chunks.push(Buffer.from(c));
    const buf = Buffer.concat(chunks);
    this.files.set(key, buf);
    return buf.length;
  }
  async listGroups(prefix: string): Promise<string[]> {
    const base = prefix ? `${prefix}/` : "";
    const groups = new Set<string>();
    for (const key of this.files.keys()) {
      if (!key.startsWith(base)) continue;
      const rest = key.slice(base.length);
      const seg = rest.split("/")[0];
      if (seg) groups.add(seg);
    }
    return [...groups];
  }
  async deleteGroup(prefix: string, group: string): Promise<void> {
    const base = prefix ? `${prefix}/${group}/` : `${group}/`;
    for (const key of [...this.files.keys()]) if (key.startsWith(base)) this.files.delete(key);
  }
}

async function testOrchestration() {
  const source = new FakeStore();
  source.files.set("vaultA/file1", Buffer.from("bytes-1"));
  source.files.set("__shares__/share1", Buffer.from("bytes-2"));

  const dest = new FakeStore();
  const { count, bytes } = await syncAll(source, dest, "", "snap1/blobs");
  assert.equal(count, 2, "copied both objects");
  assert.equal(bytes, 7 + 7, "byte total matches");
  assert.equal(dest.files.get("snap1/blobs/vaultA/file1")?.toString(), "bytes-1");
  assert.equal(dest.files.get("snap1/blobs/__shares__/share1")?.toString(), "bytes-2");

  // groupsToPrune: pure retention math
  const names = Array.from({ length: 10 }, (_, i) => timestamp(new Date(2026, 0, i + 1)));
  const pruned = groupsToPrune(names, 7);
  assert.equal(pruned.length, 3, "prunes exactly the overflow count");
  assert.deepEqual(pruned, [...names].sort().slice(0, 3), "prunes the oldest, sorted");
  assert.deepEqual(groupsToPrune(names, 100), [], "nothing pruned when under retention");

  // pruneOldGroups against the fake destination
  const multi = new FakeStore();
  for (let i = 0; i < 5; i++) multi.files.set(`grp-${i}/blobs/x`, Buffer.from("x"));
  const removed = await pruneOldGroups(multi, "", 2);
  assert.equal(removed.length, 3, "removes overflow groups");
  assert.equal((await multi.listGroups("")).length, 2, "2 groups remain");

  console.log("✓ orchestration logic checks passed (fakes, no I/O)");
}

// ─── 2. Integration test of the real local-disk adapter ──────────────
async function makeFakeDataDir(): Promise<{ dataDir: string; blobsDir: string }> {
  const dataDir = await mkdtemp(join(tmpdir(), "nekobox-data-"));
  const blobsDir = join(dataDir, "blobs");
  await mkdir(join(blobsDir, "vaultA"), { recursive: true });
  await mkdir(join(blobsDir, "__shares__"), { recursive: true });
  await writeFile(join(blobsDir, "vaultA", "file1"), "encrypted-bytes-1");
  await writeFile(join(blobsDir, "__shares__", "share1"), "encrypted-bytes-2");
  await writeFile(join(dataDir, "meta.json"), JSON.stringify({ vaults: { v1: {} }, files: {}, shares: {} }));
  return { dataDir, blobsDir };
}

async function testLocalFallbackEndToEnd() {
  const { dataDir, blobsDir } = await makeFakeDataDir();
  const backupRoot = await mkdtemp(join(tmpdir(), "nekobox-backups-"));

  // Simulate `liveStore()` (local fallback) and `backupTarget()` (local dir)
  // directly via LocalBlobStore, without needing to touch process.env / the
  // real DATA_DIR — this exercises the exact same adapter class the real
  // scripts use for the dev-fallback path.
  const live = new LocalBlobStore(blobsDir);
  const backup = new LocalBlobStore(backupRoot);

  const group1 = "2026-01-01T00-00-00-000Z";
  const r1 = await syncAll(live, backup, "", `${group1}/blobs`);
  assert.equal(r1.count, 2, "backed up both blobs");
  assert.ok(existsSync(join(backupRoot, group1, "blobs", "vaultA", "file1")), "blob present in snapshot");
  assert.equal(
    await readFile(join(backupRoot, group1, "blobs", "vaultA", "file1"), "utf8"),
    "encrypted-bytes-1",
  );

  // meta.json travels alongside blobs/ in the snapshot (handled by backup.ts
  // itself; here we just confirm LocalBlobStore.put() can place it there).
  const metaStream = Readable.from(await readFile(join(dataDir, "meta.json")));
  await backup.put(`${group1}/meta.json`, metaStream);
  assert.ok(existsSync(join(backupRoot, group1, "meta.json")), "meta.json included in snapshot");

  // A second snapshot + retention pruning down to 1.
  const group2 = "2026-01-02T00-00-00-000Z";
  await syncAll(live, backup, "", `${group2}/blobs`);
  const removed = await pruneOldGroups(backup, "", 1);
  assert.deepEqual(removed, [group1], "oldest snapshot pruned");
  assert.ok(!existsSync(join(backupRoot, group1)), "pruned snapshot removed from disk");
  assert.ok(existsSync(join(backupRoot, group2)), "retained snapshot still present");

  // ── restore: copy the remaining snapshot's blobs into an empty target ──
  const restoreDir = await mkdtemp(join(tmpdir(), "nekobox-restore-"));
  const restoreTarget = new LocalBlobStore(restoreDir);
  const r2 = await syncAll(backup, restoreTarget, `${group2}/blobs`, "");
  assert.equal(r2.count, 2, "restored both blobs");
  assert.equal(
    await readFile(join(restoreDir, "vaultA", "file1"), "utf8"),
    "encrypted-bytes-1",
    "restored blob bytes match original",
  );

  await Promise.all(
    [dataDir, backupRoot, restoreDir].map((d) => rm(d, { recursive: true, force: true })),
  );
  console.log("✓ local-fallback end-to-end backup/restore passed");
}

async function main() {
  await testOrchestration();
  await testLocalFallbackEndToEnd();
  console.log("✓ all backup/restore smoke checks passed");
}

main().catch((e) => {
  console.error("✗ backup/restore smoke failed:", e.message);
  process.exit(1);
});
