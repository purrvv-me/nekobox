import "server-only";
import crypto from "crypto";
import { promises as fs } from "fs";
import path from "path";
import * as r2 from "./r2";

// Storage abstraction. When real Cloudflare R2 credentials are present we use
// presigned URLs straight to R2. Otherwise we fall back to a LOCAL on-disk
// store served through our own /api/blob endpoint — handy for development
// without an R2 account. Either way the server only ever sees ciphertext:
// the browser encrypts before upload and decrypts after download.

const LOCAL_DIR = path.join(process.cwd(), ".storage");
const SIGN_TTL_MS = 5 * 60 * 1000; // 5 minutes, matching R2 signed-URL TTL

export function isR2Configured(): boolean {
  const id = process.env.R2_ACCESS_KEY_ID;
  return Boolean(
    id &&
      !id.startsWith("your-") && // ignore the .env.example placeholders
      process.env.R2_SECRET_ACCESS_KEY &&
      !process.env.R2_SECRET_ACCESS_KEY.startsWith("your-") &&
      process.env.R2_BUCKET &&
      (process.env.R2_ACCOUNT_ID || process.env.R2_ENDPOINT) &&
      !(process.env.R2_ACCOUNT_ID ?? "").startsWith("your-"),
  );
}

// ─── Local signed-URL helpers (capability tokens, like R2 presigning) ────
function hmacSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET required for local storage signing");
  return s;
}

function sign(method: "get" | "put", key: string, exp: number): string {
  return crypto
    .createHmac("sha256", hmacSecret())
    .update(`${method}:${key}:${exp}`)
    .digest("base64url");
}

export function verifyLocalSig(
  method: "get" | "put",
  key: string,
  exp: string | null,
  sig: string | null,
): boolean {
  if (!exp || !sig) return false;
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || Date.now() > expNum) return false;
  const expected = sign(method, key, expNum);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function localUrl(method: "get" | "put", key: string): string {
  const exp = Date.now() + SIGN_TTL_MS;
  const sig = sign(method, key, exp);
  const encoded = key.split("/").map(encodeURIComponent).join("/");
  return `/api/blob/${encoded}?m=${method}&exp=${exp}&sig=${sig}`;
}

function localPath(key: string): string {
  // key is always `<userId>/<uuid>` produced by us, but guard traversal anyway.
  const safe = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, "");
  const p = path.join(LOCAL_DIR, safe);
  if (!p.startsWith(LOCAL_DIR)) throw new Error("invalid storage key");
  return p;
}

export async function writeLocal(key: string, data: Uint8Array): Promise<void> {
  const p = localPath(key);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, data);
}

export async function readLocal(key: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(localPath(key));
  } catch {
    return null;
  }
}

// ─── Unified interface used by API routes ────────────────────────────────
export async function presignUpload(key: string, contentType: string, maxBytes: number) {
  if (isR2Configured()) return r2.presignUpload(key, contentType, maxBytes);
  return localUrl("put", key);
}

export async function presignDownload(key: string) {
  if (isR2Configured()) return r2.presignDownload(key);
  return localUrl("get", key);
}

export async function deleteObject(key: string) {
  if (isR2Configured()) return r2.deleteObject(key);
  await fs.rm(localPath(key), { force: true });
}

export async function headObject(key: string): Promise<{ size: number } | null> {
  if (isR2Configured()) return r2.headObject(key);
  try {
    const st = await fs.stat(localPath(key));
    return { size: st.size };
  } catch {
    return null;
  }
}
