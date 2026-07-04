// A BlobSource/BlobDestination backed by an S3-compatible bucket (Backblaze
// B2, a second B2 bucket, AWS S3, MinIO, ...) via the generic S3Store.

import type { Readable } from "node:stream";
import { S3Store } from "../src/s3store.js";
import type { BlobEntry, BlobDestination, BlobSource } from "./snapshotCore.js";

export class S3BlobStore implements BlobSource, BlobDestination {
  constructor(private store: S3Store) {}

  async *list(prefix = ""): AsyncIterable<BlobEntry> {
    yield* this.store.list(prefix);
  }

  async get(key: string): Promise<Readable> {
    return this.store.getStream(key);
  }

  async put(key: string, body: Readable): Promise<number> {
    return this.store.putStream(key, body);
  }

  async listGroups(prefix: string): Promise<string[]> {
    return this.store.listCommonPrefixes(prefix);
  }

  async deleteGroup(prefix: string, group: string): Promise<void> {
    const full = prefix ? `${prefix.replace(/\/+$/, "")}/${group}` : group;
    await this.store.deletePrefix(full);
  }
}
