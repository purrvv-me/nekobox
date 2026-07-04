// Snapshot the encrypted blob store to a separate backup location.
//
// Blobs are already client-side encrypted — copying them as-is is safe, no
// additional encryption is applied here.
//
// Source: wherever the LIVE store actually is (mirrors store.ts / src/b2.ts):
//   • Backblaze B2 (or any S3-compatible bucket) when B2_* env vars are set.
//   • Local `data/blobs/` otherwise (dev fallback) — this local directory is
//     NEVER read as the backup source while B2 is configured, since it isn't
//     where live blobs are being written in that case.
// Metadata (`data/meta.json`) always lives locally regardless of where blob
// bodies live, and is always included in the snapshot.
//
// Destination: a second bucket / different S3-compatible provider
// (BACKUP_S3_BUCKET) or a local folder (BACKUP_DIR, default `server/backups`)
// — see storageConfig.ts for the exact resolution rules, and BACKUP.md for
// the full environment variable reference.
//
// Usage:
//   npm run backup
//
// Cron example (daily at 03:00):
//   0 3 * * * cd /path/to/stage2-3/server && npm run backup >> backup.log 2>&1

import { createReadStream, existsSync } from "node:fs";
import { basename } from "node:path";
import { pruneOldGroups, syncAll, timestamp } from "./snapshotCore.js";
import { backupRetention, backupTarget, liveStore, metaFile } from "./storageConfig.js";

export async function runBackup(): Promise<void> {
  const src = liveStore();
  const dst = backupTarget();
  const ts = timestamp();
  const group = ts;
  const groupPrefix = dst.prefix ? `${dst.prefix}/${group}` : group;

  console.log(`Backing up from ${src.label}`);
  console.log(`         to     ${dst.label}, snapshot "${group}"`);

  const { count, bytes } = await syncAll(src.store, dst.store, "", `${groupPrefix}/blobs`);
  console.log(`✓ copied ${count} blob(s), ${(bytes / 1024 / 1024).toFixed(2)} MB`);

  // Metadata always lives locally — include it in the snapshot regardless of
  // where blob bodies live.
  const meta = metaFile();
  if (existsSync(meta)) {
    await dst.store.put(`${groupPrefix}/meta.json`, createReadStream(meta));
    console.log("✓ included meta.json");
  } else {
    console.warn("! meta.json not found locally — snapshot has blobs but no metadata index");
  }

  const pruned = await pruneOldGroups(dst.store, dst.prefix, backupRetention());
  if (pruned.length) console.log(`  pruned ${pruned.length} old snapshot(s): ${pruned.join(", ")}`);

  console.log(`✓ snapshot "${group}" complete`);
}

const isDirectRun = process.argv[1] && basename(process.argv[1]) === basename(import.meta.url);
if (isDirectRun) {
  runBackup().catch((e) => {
    console.error("✗ backup failed:", e.message);
    process.exit(1);
  });
}
