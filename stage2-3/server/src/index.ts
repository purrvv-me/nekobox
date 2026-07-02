// Stage 2 — minimal "dumb storage" backend.
//
//   POST   /vaults                 register a vault (stores only its PUBLIC key)
//   POST   /auth/challenge         get a nonce to sign
//   POST   /auth/verify            prove key possession → bearer token
//   POST   /files                  upload an encrypted blob (octet-stream body)
//   GET    /files                  list this vault's files (metadata only)
//   GET    /files/:id              download an encrypted blob
//   PATCH  /files/:id              rename (update encrypted name)
//   DELETE /files/:id              delete blob + metadata
//
// The server never decrypts, parses, or understands blob contents.

import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import {
  addFile,
  addShare,
  consumeShareOpen,
  createVault,
  deleteBlob,
  deleteFileMeta,
  deleteShare,
  getFile,
  getShare,
  getVault,
  initStore,
  listFiles,
  listShares,
  readBlob,
  renameFile,
  setFileSize,
  setShareSize,
  shareBlobStream,
  sweepShares,
  vaultUsage,
  writeBlob,
  writeShareBlob,
} from "./store.js";
import { createChallenge, issueToken, resolveToken, verifyChallenge } from "./auth.js";
import { allow } from "./ratelimit.js";

const PORT = Number(process.env.PORT ?? 4000);
const MAX_BLOB = Number(process.env.MAX_BLOB_BYTES ?? 500 * 1024 * 1024);
const MAX_VAULT = Number(process.env.MAX_VAULT_BYTES ?? 15 * 1024 * 1024 * 1024);
const RL_WINDOW = Number(process.env.RL_WINDOW_MS ?? 5 * 60 * 1000);
const RL_AUTH = Number(process.env.RL_AUTH_MAX ?? 30); // challenge + verify
const RL_WRITE = Number(process.env.RL_WRITE_MAX ?? 60); // uploads + share creation
const RL_OPEN = Number(process.env.RL_OPEN_MAX ?? 120); // anonymous share opens
const B64ISH = /^[A-Za-z0-9+/=]{1,8192}$/; // opaque base64-ish header values

await initStore();

const app = express();
app.disable("x-powered-by");

// Hardening headers on every response. This API only ever returns JSON or opaque
// octet-streams (no HTML), so a maximally strict CSP is appropriate.
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  next();
});

app.use(cors({ exposedHeaders: ["X-Enc-Name"] }));
app.use(express.json({ limit: "64kb" })); // only touches application/json bodies

const asyncH =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

// Rate-limit guard keyed by client IP. Returns false (and sends 429) if exceeded.
function rl(req: Request, res: Response, bucket: string, max: number): boolean {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  if (!allow(`${bucket}:${ip}`, max, RL_WINDOW)) {
    res.status(429).json({ error: "rate limit exceeded" });
    return false;
  }
  return true;
}

// ─── vault registration (public key only) ─────────────────────────────
app.post(
  "/vaults",
  asyncH(async (req, res) => {
    const { vaultId, authPublicKey } = req.body ?? {};
    if (typeof vaultId !== "string" || typeof authPublicKey !== "string")
      return res.status(400).json({ error: "vaultId and authPublicKey required" });
    if (getVault(vaultId)) return res.status(409).json({ error: "vault exists" });
    await createVault(vaultId, authPublicKey);
    res.status(201).json({ vaultId });
  }),
);

// ─── auth (challenge → signature → token) ─────────────────────────────
app.post("/auth/challenge", (req, res) => {
  if (!rl(req, res, "auth", RL_AUTH)) return;
  const { vaultId } = req.body ?? {};
  if (!getVault(vaultId)) return res.status(404).json({ error: "unknown vault" });
  res.json({ nonce: createChallenge(vaultId) });
});

app.post("/auth/verify", (req, res) => {
  if (!rl(req, res, "auth", RL_AUTH)) return;
  const { vaultId, nonce, signature } = req.body ?? {};
  const vault = getVault(vaultId);
  if (!vault) return res.status(404).json({ error: "unknown vault" });
  if (!verifyChallenge(vaultId, nonce, signature, vault.authPublicKey))
    return res.status(401).json({ error: "bad signature" });
  res.json(issueToken(vaultId));
});

// ─── auth middleware ──────────────────────────────────────────────────
function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.header("authorization")?.replace(/^Bearer\s+/i, "");
  const vaultId = resolveToken(token);
  if (!vaultId) return res.status(401).json({ error: "unauthorized" });
  res.locals.vaultId = vaultId;
  next();
}

function ownedFile(req: Request, res: Response) {
  const file = getFile(req.params.id);
  if (!file || file.vaultId !== res.locals.vaultId) {
    res.status(404).json({ error: "not found" });
    return null;
  }
  return file;
}

// ─── files ────────────────────────────────────────────────────────────
// Upload: raw octet-stream body streamed straight to disk (never buffered/parsed).
app.post(
  "/files",
  requireAuth,
  asyncH(async (req, res) => {
    if (!rl(req, res, "write", RL_WRITE)) return;
    const encName = req.header("x-enc-name");
    if (!encName || !B64ISH.test(encName)) return res.status(400).json({ error: "X-Enc-Name must be base64" });
    const declared = Number(req.header("content-length") ?? 0);
    if (declared > MAX_BLOB) return res.status(413).json({ error: "blob too large" });

    const vaultId: string = res.locals.vaultId;
    // Reserve an id, then stream the request body straight into its blob file.
    const meta = await addFile(vaultId, encName, 0);
    try {
      const size = await writeBlob(vaultId, meta.id, req);
      if (size > MAX_BLOB || vaultUsage(vaultId) + size > MAX_VAULT) {
        await deleteBlob(vaultId, meta.id);
        await deleteFileMeta(meta.id);
        return res.status(413).json({ error: size > MAX_BLOB ? "blob too large" : "vault quota exceeded" });
      }
      await setFileSize(meta.id, size);
      res.status(201).json({ id: meta.id, encName, size, createdAt: meta.createdAt });
    } catch (e) {
      await deleteBlob(vaultId, meta.id).catch(() => {});
      await deleteFileMeta(meta.id).catch(() => {});
      throw e;
    }
  }),
);

app.get("/files", requireAuth, (_req, res) => {
  res.json({ files: listFiles(res.locals.vaultId) });
});

app.get(
  "/files/:id",
  requireAuth,
  asyncH(async (req, res) => {
    const file = ownedFile(req, res);
    if (!file) return;
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Length", String(file.size));
    res.setHeader("X-Enc-Name", file.encName);
    readBlob(file.vaultId, file.id).pipe(res);
  }),
);

app.patch(
  "/files/:id",
  requireAuth,
  asyncH(async (req, res) => {
    const file = ownedFile(req, res);
    if (!file) return;
    const { encName } = req.body ?? {};
    if (typeof encName !== "string") return res.status(400).json({ error: "encName required" });
    await renameFile(file.id, encName);
    res.json({ id: file.id, encName });
  }),
);

app.delete(
  "/files/:id",
  requireAuth,
  asyncH(async (req, res) => {
    const file = ownedFile(req, res);
    if (!file) return;
    await deleteBlob(file.vaultId, file.id);
    await deleteFileMeta(file.id);
    res.status(204).end();
  }),
);

// ─── shares (anonymous link sharing) ──────────────────────────────────
// The server stores only: share-id, the ciphertext blob, expiry/open-limit
// metadata. The decryption key lives exclusively in the URL fragment on the
// client side and never reaches this server in any request.

const MAX_TTL_SECONDS = 366 * 24 * 3600;

function shareGone(s: { expiresAt: number | null; maxOpens: number | null; opens: number }): boolean {
  if (s.expiresAt !== null && s.expiresAt < Date.now()) return true;
  if (s.maxOpens !== null && s.opens >= s.maxOpens) return true;
  return false;
}

// Create: owner uploads a blob re-encrypted under a fresh share key.
app.post(
  "/shares",
  requireAuth,
  asyncH(async (req, res) => {
    if (!rl(req, res, "write", RL_WRITE)) return;
    const encName = req.header("x-enc-name") ?? "";
    const ownerLabel = req.header("x-owner-label") ?? "";
    if (!B64ISH.test(encName) || !B64ISH.test(ownerLabel))
      return res.status(400).json({ error: "X-Enc-Name and X-Owner-Label must be base64" });

    const ttlRaw = req.header("x-ttl-seconds");
    const maxOpensRaw = req.header("x-max-opens");
    let expiresAt: number | null = null;
    if (ttlRaw !== undefined && ttlRaw !== "") {
      const ttl = Number(ttlRaw);
      if (!Number.isInteger(ttl) || ttl < 1 || ttl > MAX_TTL_SECONDS)
        return res.status(400).json({ error: "invalid ttl" });
      expiresAt = Date.now() + ttl * 1000;
    }
    let maxOpens: number | null = null;
    if (maxOpensRaw !== undefined && maxOpensRaw !== "") {
      const n = Number(maxOpensRaw);
      if (!Number.isInteger(n) || n < 1 || n > 1_000_000)
        return res.status(400).json({ error: "invalid maxOpens" });
      maxOpens = n;
    }
    const declared = Number(req.header("content-length") ?? 0);
    if (declared > MAX_BLOB) return res.status(413).json({ error: "blob too large" });

    const vaultId: string = res.locals.vaultId;
    const meta = await addShare(vaultId, encName, ownerLabel, expiresAt, maxOpens);
    try {
      const size = await writeShareBlob(meta.id, req);
      if (size > MAX_BLOB || vaultUsage(vaultId) + size > MAX_VAULT) {
        await deleteShare(meta.id);
        return res.status(413).json({ error: size > MAX_BLOB ? "blob too large" : "vault quota exceeded" });
      }
      await setShareSize(meta.id, size);
      res.status(201).json({
        id: meta.id,
        size,
        createdAt: meta.createdAt,
        expiresAt: meta.expiresAt,
        maxOpens: meta.maxOpens,
      });
    } catch (e) {
      await deleteShare(meta.id).catch(() => {});
      throw e;
    }
  }),
);

// Owner's list (for the revoke UI). Labels are ciphertext under the owner's key.
app.get("/shares", requireAuth, (_req, res) => {
  res.json({
    shares: listShares(res.locals.vaultId).map((s) => ({
      id: s.id,
      ownerLabel: s.ownerLabel,
      size: s.size,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      maxOpens: s.maxOpens,
      opens: s.opens,
    })),
  });
});

// Public metadata — lets the recipient see the (encrypted) name and validity
// WITHOUT consuming an open. 404 unknown/revoked, 410 expired/exhausted.
app.get("/shares/:id/meta", (req, res) => {
  const s = getShare(req.params.id);
  if (!s) return res.status(404).json({ error: "not found" });
  if (shareGone(s)) return res.status(410).json({ error: "gone" });
  res.json({
    encName: s.encName,
    size: s.size,
    expiresAt: s.expiresAt,
    opensRemaining: s.maxOpens === null ? null : s.maxOpens - s.opens,
  });
});

// Public download — consumes one open, then streams the ciphertext.
app.get(
  "/shares/:id",
  asyncH(async (req, res) => {
    if (!rl(req, res, "open", RL_OPEN)) return;
    const s = getShare(req.params.id);
    if (!s) return res.status(404).json({ error: "not found" });
    if (shareGone(s)) return res.status(410).json({ error: "gone" });
    if (!(await consumeShareOpen(s.id))) return res.status(410).json({ error: "gone" });
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Length", String(s.size));
    res.setHeader("X-Enc-Name", s.encName);
    shareBlobStream(s.id).pipe(res);
  }),
);

// Revoke — owner only. Removes blob + metadata; the link dies immediately.
app.delete(
  "/shares/:id",
  requireAuth,
  asyncH(async (req, res) => {
    const s = getShare(req.params.id);
    if (!s || s.vaultId !== res.locals.vaultId) return res.status(404).json({ error: "not found" });
    await deleteShare(s.id);
    res.status(204).end();
  }),
);

// Periodically clean up expired shares so blobs don't linger on disk.
setInterval(() => void sweepShares().catch(() => {}), 60_000).unref?.();

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("server error:", err);
  res.status(500).json({ error: "internal error" });
});

app.listen(PORT, () => console.log(`dumb-storage backend on http://localhost:${PORT}`));
