# Backing up the Stage 2 blob store

Stage 2's encrypted blob bodies live in **Backblaze B2** (S3-compatible) when
`B2_*` env vars are configured — the primary, production storage. Local disk
(`data/blobs/`) is **only** a development fallback used when those vars are
absent; the backup scripts never read the local folder as their source while
B2 is configured (they check the same `B2_*` variables `store.ts` and `src/b2.ts`
already use to decide where live blobs are).

Metadata (`data/meta.json` — ids, encrypted names, sizes, share expiry/limits)
always lives on local disk, regardless of where blob bodies live, and is always
included in every snapshot alongside the blobs.

Because files are encrypted **client-side** before they ever reach this server,
backing them up **as-is** is safe — there is nothing to additionally encrypt.

## What gets backed up
- Every blob body from the **live store** (the B2 bucket, or `data/blobs/` if
  B2 isn't configured).
- `data/meta.json` — always, always from local disk.
- `data/meta.lock` (a transient write-lock file) is never included.

Nothing here ever includes plaintext, passwords, or private keys — Stage 2's
auth model never has server-side secrets to begin with (see the main
[README](./README.md#auth-without-loginpassword)).

## Choosing a backup destination
| Destination | Set... | Good for |
|---|---|---|
| **A second B2 bucket, same account** (recommended default) | `BACKUP_S3_BUCKET` only | Lowest effort — reuses your existing `B2_*` credentials/endpoint, just a different bucket name. |
| **A different S3-compatible provider/account** | `BACKUP_S3_BUCKET` + `BACKUP_S3_ENDPOINT`/`BACKUP_S3_ACCESS_KEY_ID`/`BACKUP_S3_SECRET_ACCESS_KEY` | True off-provider redundancy (e.g. AWS S3, another B2 account). |
| **A local folder on the server** | leave `BACKUP_S3_BUCKET` unset | Zero new accounts/cost; only protects against B2-side mistakes (e.g. accidental deletion), not against losing the server itself. Point `BACKUP_DIR` at a second physical disk/mount if you have one. |

All three use the exact same script — only the env vars differ.

## Usage

### Manual, one-off
```bash
cd stage2-3/server
npm run backup
```
This creates a timestamped snapshot (containing every blob + `meta.json`),
prunes snapshots beyond the retention count, and prints what it did:
```
Backing up from B2 bucket "nekobox-vault"
         to     S3 bucket "nekobox-vault-backup" (prefix "nekobox-backups")
✓ copied 128 blob(s), 340.12 MB
✓ included meta.json
  pruned 1 old snapshot(s): 2026-06-27T03-00-00-000Z
✓ snapshot "2026-07-04T03-00-00-000Z" complete
```

### Scheduled (cron)
```cron
# Daily at 03:00, keep output for troubleshooting
0 3 * * * cd /path/to/stage2-3/server && npm run backup >> backup.log 2>&1
```

### Environment variables
See [.env.example](.env.example) for the full list. The important ones:

| Variable | Default | Purpose |
|---|---|---|
| `B2_ENDPOINT` / `B2_REGION` / `B2_ACCESS_KEY_ID` / `B2_SECRET_ACCESS_KEY` / `B2_BUCKET` | — | Your **live** bucket. Backup reads FROM here when all are set. |
| `BACKUP_DIR` | `server/backups` | Local snapshot folder (used only when `BACKUP_S3_BUCKET` is unset). |
| `BACKUP_RETENTION` | `7` | How many snapshots to keep (oldest pruned first) — applies to both local and bucket destinations. |
| `BACKUP_S3_BUCKET` | _(unset)_ | Set to back up into a bucket instead of a local folder. |
| `BACKUP_S3_PREFIX` | `nekobox-backups` | Key prefix inside that bucket. |
| `BACKUP_S3_ENDPOINT` / `BACKUP_S3_REGION` / `BACKUP_S3_ACCESS_KEY_ID` / `BACKUP_S3_SECRET_ACCESS_KEY` | _(reuse `B2_*`)_ | Only set these to back up to a **different** account/provider than your live bucket. |

## Restoring after data loss

```bash
cd stage2-3/server

# 1. See what's available
npm run restore
#   Available snapshots in B2 bucket "nekobox-vault-backup" (oldest → newest):
#     2026-07-01T03-00-00-000Z
#     2026-07-02T03-00-00-000Z

# 2. Restore a specific one back into the WORKING bucket (or local data/blobs,
#    if B2 isn't configured) — this uses your normal B2_* env vars as the
#    restore target, so make sure they're set to the live bucket you want to
#    repopulate.
npm run restore -- 2026-07-02T03-00-00-000Z
```

If the live store (bucket or local `data/`) already has content, restore
refuses to touch it — add `--force` once you're sure you want to overwrite it:
```bash
npm run restore -- 2026-07-02T03-00-00-000Z --force
```

This restores **both**: every blob back into the live B2 bucket (or local
`data/blobs`), and `meta.json` back onto local disk. Then **restart the
server process** (`npm start`) — it loads metadata from disk on startup.

### Restoring into a brand-new bucket
If the original B2 bucket itself was lost (not just its contents), create a
new bucket first, point `B2_BUCKET` (and the rest of `B2_*`) at it, then run
`npm run restore -- <snapshot>` as above — it uploads every blob straight into
that new bucket.

## Testing the scripts yourself
```bash
npm run test:backup
```
Runs: (1) the pure sync/retention orchestration logic against in-memory fakes,
and (2) an end-to-end backup → prune → restore pass using the real local-disk
adapter, all against temporary directories — no live data, no B2 credentials,
and no running server required.

(The B2-backed code path itself — `src/s3store.ts` — is a thin, directly
auditable wrapper around `@aws-sdk/client-s3`/`@aws-sdk/lib-storage` and isn't
exercised against a real bucket in automated tests, since that would require
live credentials. Test it against your actual bucket once by running
`npm run backup` with `B2_*` set and confirming the object shows up in your B2
console, before relying on it.)
