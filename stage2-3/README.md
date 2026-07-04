# NekoBox — Stages 2 & 3 (dumb storage + Explorer UI)

A self-contained mini-project that builds on the **Stage 1** crypto module
(`../src/crypto/secure`):

- **Stage 2 — `server/`**: a minimal "dumb storage" backend (Express). It stores
  only encrypted blobs + opaque metadata, and issues session tokens without any
  password — via a challenge–response signature.
- **Stage 3 — `web/`**: a Windows 11 File Explorer-style React app wired to the
  Stage 1 crypto module and the Stage 2 backend.

```
┌────────── browser ──────────┐        ┌──────── server (dumb) ────────┐
│  Stage 1 crypto (@secure)   │        │  blobs in B2 (opaque) —       │
│  password → master key      │  HTTPS │    local disk = dev fallback  │
│  encrypt/ decrypt / names   │◀──────▶│  metadata: id, encName, size  │
│  ECDSA auth key (wrapped)   │  token │  vault PUBLIC auth key only   │
└─────────────────────────────┘        └───────────────────────────────┘
```

Blob bodies are stored in **Backblaze B2** (S3-compatible) when `B2_*` env vars
are set — see [server/.env.example](server/.env.example) — with local disk as a
development-only fallback. Metadata always lives in a local `data/meta.json`.

## What the server knows (and doesn't)
- **Stores:** encrypted blobs (B2, or local disk in dev), per-file metadata
  (`id`, encrypted `encName`, `size`, `createdAt`, always local), and each
  vault's **public** auth key.
- **Never stores / sees:** passwords, master keys, plaintext, file contents,
  email/phone. It never parses or decrypts a blob.

## Auth without login/password
There is no username/password on the server. Instead:
1. The client unlocks locally (password → master key, via Stage 1).
2. It holds an **ECDSA P-256 private key** (wrapped under the master key, kept in
   `localStorage`). The server has only the matching **public** key.
3. `POST /auth/challenge` → server returns a random nonce.
4. The client **signs** it and `POST /auth/verify` → server checks the signature
   against the stored public key and issues a short-lived **bearer token**.

So the token is only obtainable *after a successful local decrypt* — exactly the
requested model — and the server still stores no secrets.

---

## Run it

### 1. Backend (Stage 2)
```bash
cd server
npm install
npm start            # http://localhost:4000
npm run smoke        # (optional) end-to-end self-test in another terminal
```

### 2. Frontend (Stage 3)
```bash
cd web
npm install
npm run dev          # http://localhost:5173
```
Set `VITE_API` to point at the backend if it isn't on `http://localhost:4000`.

> Uses the browser Web Crypto API — run on `localhost` (secure context).

---

## API (Stage 2)
| Method | Path              | Auth | Purpose                                   |
|--------|-------------------|------|-------------------------------------------|
| POST   | `/vaults`         | —    | Register a vault (stores only public key) |
| POST   | `/auth/challenge` | —    | Get a nonce to sign                       |
| POST   | `/auth/verify`    | —    | Prove key possession → bearer token       |
| POST   | `/files`          | ✓    | Upload an encrypted blob (`octet-stream`) |
| GET    | `/files`          | ✓    | List this vault's files (metadata only)   |
| GET    | `/files/:id`      | ✓    | Download an encrypted blob                |
| PATCH  | `/files/:id`      | ✓    | Rename (update encrypted name)            |
| DELETE | `/files/:id`      | ✓    | Delete blob + metadata                    |

Upload: the blob is streamed straight to disk; the encrypted name travels in the
`X-Enc-Name` header. Nothing is buffered or parsed.

## UI (Stage 3)
Windows 11 Explorer look: tab strip, command bar, navigation pane, file grid,
status bar. Features:
- **Drag-and-drop** upload (files encrypted before leaving the browser).
- **Right-click** context menu: Open/Preview, Download, Rename, Share*, Delete.
- **🔒 lock badge** on every file.
- **Search** over **client-decrypted** names (never sent to the backend).
- Virtual "folders" (All / Recent / by type) derived from decrypted names.
- In-browser preview for images & audio (decrypted locally).

\* Sharing needs user accounts, which this dumb backend intentionally doesn't
have — the menu item explains that.

## Backups
See [server/BACKUP.md](server/BACKUP.md) for how to snapshot the encrypted blob
store (`npm run backup`), schedule it via cron, optionally sync it offsite to
an S3-compatible bucket, and restore from a snapshot (`npm run restore`).

## Notes & limits (honest)
- Metadata (size) is visible to the server; names are encrypted.
- The token store and vault metadata are in-memory / a JSON file — fine for a
  demo, not for production (use a DB + object storage there).
- Recovery reset can't cryptographically prove code knowledge (inherent to
  zero-knowledge); real deployments should add email verification.
- No TLS here — put it behind HTTPS in production (Web Crypto needs it anyway).
