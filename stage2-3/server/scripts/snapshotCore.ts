// Pure-ish orchestration logic for backup/restore: sync every object from a
// source into a destination, and manage retention of timestamped snapshot
// groups. Deliberately decoupled from *which* storage backend is source or
// destination (local disk, B2, or any other S3-compatible bucket) via the
// small BlobSource/BlobDestination interfaces below — this is what makes it
// unit-testable with in-memory fakes instead of real network calls.

import type { Readable } from "node:stream";

export interface BlobEntry {
  key: string;
  size: number;
}

export interface BlobSource {
  list(prefix?: string): AsyncIterable<BlobEntry>;
  get(key: string): Promise<Readable>;
}

export interface BlobDestination {
  put(key: string, body: Readable): Promise<number>;
  /** List immediate "subfolder" names under a prefix (timestamped snapshot groups). */
  listGroups(prefix: string): Promise<string[]>;
  /** Delete every object under `${prefix}/${group}`. */
  deleteGroup(prefix: string, group: string): Promise<void>;
}

export interface SyncResult {
  count: number;
  bytes: number;
}

/**
 * Copy every object under `sourcePrefix` in `source` into `dest`, prefixed
 * with `destPrefix/` — used to write one timestamped snapshot group.
 */
export async function syncAll(
  source: BlobSource,
  dest: BlobDestination & { put: BlobDestination["put"] },
  sourcePrefix: string,
  destPrefix: string,
): Promise<SyncResult> {
  let count = 0;
  let bytes = 0;
  for await (const entry of source.list(sourcePrefix)) {
    const rel = entry.key.startsWith(sourcePrefix) ? entry.key.slice(sourcePrefix.length) : entry.key;
    const destKey = joinKey(destPrefix, rel);
    const body = await source.get(entry.key);
    const written = await dest.put(destKey, body);
    count++;
    bytes += written;
  }
  return { count, bytes };
}

/**
 * Given existing group names (any order) and a retention count, return the
 * names beyond retention that should be pruned (oldest first). Names are
 * ISO-timestamp-prefixed, so a plain lexicographic sort is also chronological.
 */
export function groupsToPrune(names: string[], retention: number): string[] {
  return [...names].sort().slice(0, Math.max(0, names.length - retention));
}

/** Prune old snapshot groups under `prefix`, keeping the newest `retention`. */
export async function pruneOldGroups(
  dest: BlobDestination,
  prefix: string,
  retention: number,
): Promise<string[]> {
  const groups = await dest.listGroups(prefix);
  const stale = groupsToPrune(groups, retention);
  for (const g of stale) await dest.deleteGroup(prefix, g);
  return stale;
}

function joinKey(...parts: string[]): string {
  return parts
    .map((p) => p.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

/** Filesystem/S3-key-safe timestamp, e.g. 2026-07-04T03-00-00-000Z. */
export function timestamp(d: Date = new Date()): string {
  return d.toISOString().replace(/[:.]/g, "-");
}
