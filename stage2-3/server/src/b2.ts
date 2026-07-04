// Backblaze B2 (S3-compatible) blob storage — the primary production store
// for Stage 2, mirroring the main NekoBox app's Cloudflare R2 adapter
// (../../src/lib/r2.ts): same idea (private bucket, server-side access only),
// different provider. B2's S3-compatible API needs an explicit region +
// endpoint (e.g. https://s3.us-west-004.backblazeb2.com) rather than R2's
// account-id-derived endpoint.
//
// Local disk (see store.ts) remains the fallback when B2 isn't configured —
// handy for development without any cloud credentials.

import { S3Store, type S3StoreConfig } from "./s3store.js";

export function isB2Configured(): boolean {
  return Boolean(
    process.env.B2_ACCESS_KEY_ID &&
      process.env.B2_SECRET_ACCESS_KEY &&
      process.env.B2_BUCKET &&
      process.env.B2_ENDPOINT,
  );
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} must be set to use Backblaze B2 storage.`);
  return v;
}

export function b2Config(): S3StoreConfig {
  return {
    endpoint: requireEnv("B2_ENDPOINT"),
    region: process.env.B2_REGION || "us-west-004",
    accessKeyId: requireEnv("B2_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("B2_SECRET_ACCESS_KEY"),
    bucket: requireEnv("B2_BUCKET"),
  };
}

let _store: S3Store | null = null;
export function b2Store(): S3Store {
  _store ??= new S3Store(b2Config());
  return _store;
}
