// A BlobSource/BlobDestination backed by a local directory — used both as the
// dev-fallback "live store" adapter (mirrors store.ts's local-disk path) and
// as a possible backup destination ("local folder on the server").

import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import type { Readable } from "node:stream";
import type { BlobEntry, BlobDestination, BlobSource } from "./snapshotCore.js";

function toKey(root: string, absPath: string): string {
  return relative(root, absPath).split(sep).join("/");
}
function toPath(root: string, key: string): string {
  return join(root, ...key.split("/"));
}

export class LocalBlobStore implements BlobSource, BlobDestination {
  constructor(private root: string) {}

  async *list(prefix = ""): AsyncIterable<BlobEntry> {
    const start = prefix ? toPath(this.root, prefix) : this.root;
    if (!existsSync(start)) return;
    yield* this.walk(start);
  }

  private async *walk(dir: string): AsyncGenerator<BlobEntry> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) {
        yield* this.walk(p);
      } else if (entry.isFile()) {
        const size = (await stat(p)).size;
        yield { key: toKey(this.root, p), size };
      }
    }
  }

  async get(key: string): Promise<Readable> {
    return createReadStream(toPath(this.root, key));
  }

  async put(key: string, body: Readable): Promise<number> {
    const p = toPath(this.root, key);
    await mkdir(dirname(p), { recursive: true });
    await new Promise<void>((resolve, reject) => {
      const out = createWriteStream(p);
      body.pipe(out);
      body.on("error", reject);
      out.on("error", reject);
      out.on("finish", resolve);
    });
    return (await stat(p)).size;
  }

  /** Immediate subdirectory names under `prefix` (relative to root). */
  async listGroups(prefix: string): Promise<string[]> {
    const dir = prefix ? join(this.root, prefix) : this.root;
    if (!existsSync(dir)) return [];
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  }

  async deleteGroup(prefix: string, group: string): Promise<void> {
    const dir = prefix ? join(this.root, prefix, group) : join(this.root, group);
    await rm(dir, { recursive: true, force: true });
  }
}
