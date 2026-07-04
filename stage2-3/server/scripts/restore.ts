// Restore a snapshot created by backup.ts back into the LIVE store — the B2
// bucket (or local disk fallback) that store.ts is actually configured to use
// right now. Metadata is restored to the local `data/meta.json`; blob bodies
// are restored to wherever the live store is (B2 bucket if configured, else
// local `data/blobs`).
//
// Usage:
//   npm run restore                                # list available snapshots
//   npm run restore -- 2026-07-04T03-00-00-000Z    # restore into the live store
//   npm run restore -- 2026-07-04T03-00-00-000Z --force
//                                                   # overwrite existing live data
//
// After restoring, restart the server process (it caches metadata in memory
// and reloads it from disk only on startup / around the share-open lock).

import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { syncAll } from "./snapshotCore.js";
import { backupTarget, liveStore, metaFile } from "./storageConfig.js";
import type { BlobSource } from "./snapshotCore.js";

export async function listSnapshots(): Promise<string[]> {
  const dst = backupTarget();
  const groups = await dst.store.listGroups(dst.prefix);
  return groups.sort();
}

async function hasAnyBlob(source: BlobSource): Promise<boolean> {
  for await (const _ of source.list()) return true;
  return false;
}

async function liveMetaHasContent(): Promise<boolean> {
  if (!existsSync(metaFile())) return false;
  try {
    const raw = await readFile(metaFile(), "utf8");
    const db = JSON.parse(raw);
    return Boolean(
      (db.vaults && Object.keys(db.vaults).length) ||
        (db.files && Object.keys(db.files).length) ||
        (db.shares && Object.keys(db.shares).length),
    );
  } catch {
    return false;
  }
}

export interface RestoreOptions {
  force?: boolean;
}

/**
 * Restore a named snapshot into the live store. Refuses to clobber existing
 * live data (a non-empty meta.json, or any object already in the live blob
 * store) unless `force` is set.
 */
export async function restoreSnapshot(name: string, opts: RestoreOptions = {}): Promise<void> {
  const dst = backupTarget();
  const live = liveStore();
  const groupPrefix = dst.prefix ? `${dst.prefix}/${name}` : name;

  if (!opts.force) {
    const [metaBusy, blobsBusy] = await Promise.all([liveMetaHasContent(), hasAnyBlob(live.store)]);
    if (metaBusy || blobsBusy) {
      throw new Error(
        `Refusing to overwrite existing live data (${live.label}).\n` +
          `Pass --force to overwrite it (existing contents will be replaced).`,
      );
    }
  }

  // 1. Metadata — always a local file, restored directly.
  try {
    const metaStream = await dst.store.get(`${groupPrefix}/meta.json`);
    await mkdir(dirname(metaFile()), { recursive: true });
    await new Promise<void>((resolve, reject) => {
      const out = createWriteStream(metaFile());
      metaStream.pipe(out);
      metaStream.on("error", reject);
      out.on("error", reject);
      out.on("finish", resolve);
    });
  } catch (e) {
    console.warn(`! could not restore meta.json from snapshot "${name}": ${(e as Error).message}`);
  }

  // 2. Blob bodies — into wherever the live store is (B2 bucket or local disk).
  const { count, bytes } = await syncAll(dst.store, live.store, `${groupPrefix}/blobs`, "");
  console.log(`✓ restored ${count} blob(s), ${(bytes / 1024 / 1024).toFixed(2)} MB, into ${live.label}`);
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const name = args.find((a) => !a.startsWith("--"));

  if (!name || name === "--list") {
    const snaps = await listSnapshots();
    const dst = backupTarget();
    if (!snaps.length) {
      console.log(`No snapshots found in ${dst.label}. Run \`npm run backup\` first.`);
      return;
    }
    console.log(`Available snapshots in ${dst.label} (oldest → newest):`);
    for (const s of snaps) console.log(`  ${s}`);
    console.log("\nRestore one with: npm run restore -- <snapshot-name> [--force]");
    return;
  }

  await restoreSnapshot(name, { force });
  console.log(`✓ restored "${name}"`);
  console.log("  Restart the server process for it to pick up the restored data.");
}

const isDirectRun = process.argv[1]?.endsWith("restore.ts") || process.argv[1]?.endsWith("restore.js");
if (isDirectRun) {
  main().catch((e) => {
    console.error("✗ restore failed:", e.message);
    process.exit(1);
  });
}
