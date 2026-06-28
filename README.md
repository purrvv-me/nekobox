# 🐾 NekoBox

**Your private, end-to-end encrypted file vault — a personal "secure OS" in the browser.**

NekoBox encrypts every file *in your browser* before it ever leaves your device.
The server only ever stores ciphertext and wrapped key material — it never sees
your files, your password, or any usable key. Forget your password and the files
are unrecoverable (unless you kept your recovery code) — that's the whole point.

The UI is a nostalgic **Windows 11 File Explorer**: a desktop window with a tab
strip, command bar, address bar, navigation pane, folders, grid/details views,
right-click menus, and keyboard shortcuts.

> ⚠️ **Educational / portfolio project.** The cryptographic design is sound and
> tested, but it has not had a professional security audit. Don't trust real
> secrets to it without one.

---

## ✨ Features

- **Zero-knowledge E2EE** — AES-256-GCM, keys derived & used only in the browser.
- **KEK/VMK key hierarchy** — a random Vault Master Key wrapped by your password,
  so changing your password re-wraps one key instead of re-encrypting everything.
- **Recovery code** — a 160-bit code shown once at signup; the only way back in if
  you forget your password. The server can't help.
- **Change password** — without re-encrypting your whole vault.
- **Folders** — create, rename, delete, drag-and-drop files between them
  (folder names are encrypted too).
- **Sharing** — share a file with another user; the file's key is re-wrapped with
  the recipient's RSA public key, so only they can open it.
- **Chunked encryption** — large files are encrypted in 4 MiB chunks, so they
  never have to fit in memory all at once.
- **File manager UX** — search, multi-select (Ctrl/Shift-click), keyboard
  shortcuts (F2 / Del / Enter / Esc / Ctrl+A), grid & sortable details views,
  in-browser image/audio preview, drag-and-drop upload.
- **Private storage** — Cloudflare R2 via short-lived signed URLs, with a local
  on-disk fallback (HMAC capability tokens) for development without an R2 account.
- **Rate limiting** and a per-user **storage quota**.
- **Tested crypto core** — round-trips, wrong-password rejection, recovery,
  password change, RSA sharing, chunked encryption & tamper detection.

---

## 🔐 How the encryption works

```
password ──PBKDF2(SHA-256, 200k, salt)──▶ PWK ──wraps──▶ VMK (random vault master key)
recovery code ──PBKDF2(…, recoverySalt)──▶ RWK ──wraps──▶ VMK   (second wrapping)
                                                            │
                         ┌──────────────────────────────────┼───────────────────────────┐
                         ▼                                   ▼                            ▼
               RSA private key (sharing)        each file's DEK (AES-256-GCM)    folder & file names
               wrapped under VMK                wrapped under VMK                encrypted under VMK
                                                       │
                                                file body encrypted in chunks with the DEK
                       sharing: a file's DEK is re-wrapped with the recipient's RSA public key
```

**What the server stores:** `argon2id(password)` (auth only), the PBKDF2 salts,
the VMK wrapped under the password key *and* under the recovery key, the RSA
public key, the AES-wrapped RSA private key, per-file wrapped DEKs + IVs, and the
encrypted blobs. None of it is usable without your password or recovery code.

**Why KEK/VMK?** Because the VMK never changes, changing your password only
re-wraps that one key — no bulk re-encryption — and recovery is a clean second
wrapping of the same VMK.

### A note on "shared key derived from both users"
True E2EE can't derive a shared secret from two independent passwords. NekoBox
uses the standard, correct approach: **asymmetric key wrapping** (RSA-OAEP) — the
sharer wraps the file's symmetric DEK with the recipient's public key. The server
stays zero-knowledge.

---

## 🧱 Tech stack

| Layer     | Tech                                                        |
|-----------|-------------------------------------------------------------|
| Frontend  | Next.js 14 (App Router), React 18, Tailwind CSS             |
| Backend   | Next.js API routes                                          |
| Database  | PostgreSQL + Prisma ORM                                     |
| Storage   | Cloudflare R2 (S3-compatible) + local-disk dev fallback     |
| Auth      | argon2id password hashing, JWT in an httpOnly cookie (jose) |
| Crypto    | Web Crypto API (PBKDF2, AES-256-GCM, RSA-OAEP)              |
| Tests     | Vitest                                                      |

---

## 🚀 Getting started

### 1. Prerequisites
- Node 18+
- A PostgreSQL database (e.g. a free [Neon](https://neon.tech) project)
- *(Optional)* a Cloudflare R2 bucket — without it, files are stored locally in
  `./.storage` (encrypted), perfect for development.

### 2. Install & configure
```bash
npm install
cp .env.example .env      # then edit .env
```
Generate a strong `JWT_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### 3. Database
```bash
npm run db:push
```

### 4. Run
```bash
npm run dev          # http://localhost:3000
npm test             # run the crypto test suite
```

> Web Crypto's `crypto.subtle` requires a secure context — use `localhost` in dev
> and HTTPS in production.

---

## ☁️ Deploying

NekoBox is a full-stack app and **cannot run on GitHub Pages** (which is static
only). Deploy it on a Node host:

1. **Vercel** (recommended) — import the repo, set env vars (`DATABASE_URL`,
   `JWT_SECRET`, and the `R2_*` keys), and deploy.
2. **Database** — a managed Postgres (Neon / Supabase / Railway).
3. **Storage** — a private Cloudflare R2 bucket (the local fallback is for dev
   only; serverless filesystems aren't persistent).

The static landing page in [`/docs`](docs/index.html) is what GitHub Pages serves.

---

## 🛡️ Security notes & honest limitations
- The server never logs file contents or keys; all file ops require a valid JWT.
- R2 bucket must be **private**; blobs are reachable only via 5-minute signed URLs.
- The rate limiter is **in-memory** (single-instance). For a cluster, back it with
  Redis.
- **Recovery reset** can't cryptographically prove recovery-code knowledge
  (that's inherent to zero-knowledge); worst case is password-material vandalism,
  not data disclosure. A production build should add email verification.
- Metadata (file size, MIME type) is stored in plaintext for listing/quotas.
- Revoking a share stops future access but can't recall a copy already decrypted.

---

## 📂 Project structure
```
src/
  app/            # pages (login, register, recover, vault, shared) + API routes
  components/     # UI (explorer chrome, dialogs, nav pane, icons…)
  crypto/         # client.ts (Web Crypto core) + vaultOps.ts + tests
  lib/            # auth, prisma, storage (R2 + local), rate limit, validation
prisma/           # schema
docs/             # static landing page for GitHub Pages
```

## 📄 License
MIT — see [LICENSE](LICENSE).
