// High-level vault operations that tie the Web Crypto primitives to the API.
// Everything here runs in the browser; plaintext never leaves it.

import {
  aesDecryptString,
  aesEncryptString,
  decryptFileChunked,
  encryptFileChunked,
  generateDek,
  unwrapDekWithMaster,
  wrapDekWithMaster,
} from "./client";

export interface VaultFile {
  id: string;
  encName: string;
  encNameIv: string;
  mimeType: string;
  size: number;
  createdAt: string;
  wrappedDek: string;
  wrappedDekIv: string;
  contentIv: string;
  chunkSize: number;
  folderId: string | null;
}

export interface DecryptedFile extends VaultFile {
  name: string; // decrypted display name
}

export interface DecryptedFolder {
  id: string;
  name: string;
  fileCount: number;
  createdAt: string;
}

async function asJson(res: Response) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

async function responseDetail(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  const trimmed = text.trim().replace(/\s+/g, " ").slice(0, 240);
  return trimmed ? `${res.status} ${res.statusText}: ${trimmed}` : `${res.status} ${res.statusText}`;
}

async function uploadCiphertext(
  uploadUrl: string,
  storageKey: string,
  blob: Blob,
): Promise<void> {
  let directFailure = "";
  try {
    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: blob,
    });
    if (put.ok) return;
    directFailure = await responseDetail(put);
  } catch (err) {
    directFailure = err instanceof Error ? err.message : "browser PUT failed";
  }

  const fallback = await fetch("/api/files/upload", {
    method: "PUT",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-NekoBox-Storage-Key": storageKey,
    },
    body: blob,
  }).catch((err) => {
    throw new Error(
      `Upload to storage failed. Direct PUT failed (${directFailure}); fallback request failed (${err instanceof Error ? err.message : "request failed"}).`,
    );
  });

  if (!fallback.ok) {
    throw new Error(
      `Upload to storage failed. Direct PUT failed (${directFailure}); fallback failed (${await responseDetail(fallback)}).`,
    );
  }
}

async function fetchCiphertext(downloadUrl: string, fileId: string): Promise<ArrayBuffer> {
  let directFailure = "";
  try {
    const res = await fetch(downloadUrl);
    if (res.ok) return res.arrayBuffer();
    directFailure = await responseDetail(res);
  } catch (err) {
    directFailure = err instanceof Error ? err.message : "browser GET failed";
  }

  const fallback = await fetch(`/api/files/${fileId}/blob`, { cache: "no-store" }).catch((err) => {
    throw new Error(
      `Could not fetch encrypted blob. Direct GET failed (${directFailure}); fallback request failed (${err instanceof Error ? err.message : "request failed"}).`,
    );
  });
  if (!fallback.ok) {
    throw new Error(
      `Could not fetch encrypted blob. Direct GET failed (${directFailure}); fallback failed (${await responseDetail(fallback)}).`,
    );
  }
  return fallback.arrayBuffer();
}

// ─── List + decrypt names ─────────────────────────────────────────────
export async function listVault(masterKey: CryptoKey): Promise<DecryptedFile[]> {
  const { files } = await asJson(await fetch("/api/files", { cache: "no-store" }));
  return Promise.all(
    (files as VaultFile[]).map(async (f) => ({
      ...f,
      name: await aesDecryptString(masterKey, { ciphertext: f.encName, iv: f.encNameIv }).catch(
        () => "⚠ undecryptable",
      ),
    })),
  );
}

// ─── Folders ──────────────────────────────────────────────────────────
interface FolderRaw {
  id: string;
  encName: string;
  encNameIv: string;
  fileCount: number;
  createdAt: string;
}

export async function listFolders(masterKey: CryptoKey): Promise<DecryptedFolder[]> {
  const { folders } = await asJson(await fetch("/api/folders", { cache: "no-store" }));
  return Promise.all(
    (folders as FolderRaw[]).map(async (f) => ({
      id: f.id,
      fileCount: f.fileCount,
      createdAt: f.createdAt,
      name: await aesDecryptString(masterKey, { ciphertext: f.encName, iv: f.encNameIv }).catch(
        () => "⚠ folder",
      ),
    })),
  );
}

export async function createFolder(masterKey: CryptoKey, name: string): Promise<void> {
  const encName = await aesEncryptString(masterKey, name);
  await asJson(
    await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ encName: encName.ciphertext, encNameIv: encName.iv }),
    }),
  );
}

export async function deleteFolder(folderId: string): Promise<void> {
  await asJson(await fetch(`/api/folders/${folderId}`, { method: "DELETE" }));
}

export async function renameFolder(
  masterKey: CryptoKey,
  folderId: string,
  name: string,
): Promise<void> {
  const encName = await aesEncryptString(masterKey, name);
  await asJson(
    await fetch(`/api/folders/${folderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ encName: encName.ciphertext, encNameIv: encName.iv }),
    }),
  );
}

// ─── Rename / move a file ─────────────────────────────────────────────
export async function renameFile(
  masterKey: CryptoKey,
  fileId: string,
  name: string,
): Promise<void> {
  const encName = await aesEncryptString(masterKey, name);
  await asJson(
    await fetch(`/api/files/${fileId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ encName: encName.ciphertext, encNameIv: encName.iv }),
    }),
  );
}

export async function moveFile(fileId: string, folderId: string | null): Promise<void> {
  await asJson(
    await fetch(`/api/files/${fileId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId }),
    }),
  );
}

// ─── Upload ───────────────────────────────────────────────────────────
export async function uploadFile(
  masterKey: CryptoKey,
  file: File,
  folderId?: string | null,
): Promise<void> {
  // 1. Encrypt the body with a fresh random DEK, in chunks (large-file safe).
  const dek = await generateDek();
  const plaintext = await file.arrayBuffer();
  const { blob, contentIv, chunkSize } = await encryptFileChunked(dek, plaintext);

  // 2. Ask the server for a presigned PUT URL.
  const presign = await asJson(
    await fetch("/api/files/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mimeType: file.type || "application/octet-stream", size: blob.size }),
    }),
  );

  // 3. Upload the ciphertext. Prefer direct-to-storage; fall back to same-origin
  // server upload when a bucket rejects browser PUTs (most commonly CORS).
  await uploadCiphertext(presign.uploadUrl, presign.storageKey, blob);

  // 4. Wrap the DEK + encrypt the filename under the master key, then persist.
  const wrappedDek = await wrapDekWithMaster(masterKey, dek);
  const encName = await aesEncryptString(masterKey, file.name);

  await asJson(
    await fetch("/api/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storageKey: presign.storageKey,
        encName: encName.ciphertext,
        encNameIv: encName.iv,
        mimeType: file.type || "application/octet-stream",
        wrappedDek: wrappedDek.ciphertext,
        wrappedDekIv: wrappedDek.iv,
        contentIv,
        chunkSize,
        folderId: folderId ?? null,
      }),
    }),
  );
}

// ─── Download + decrypt (owner) ───────────────────────────────────────
export async function downloadAndDecrypt(
  masterKey: CryptoKey,
  fileId: string,
): Promise<{ blob: Blob; mimeType: string }> {
  const meta = await asJson(await fetch(`/api/files/${fileId}`, { cache: "no-store" }));
  const dek = await unwrapDekWithMaster(masterKey, {
    ciphertext: meta.wrappedDek,
    iv: meta.wrappedDekIv,
  });
  const ciphertext = await fetchCiphertext(meta.url, fileId);
  const plaintext = await decryptFileChunked(dek, ciphertext, meta.contentIv, meta.chunkSize);
  return { blob: new Blob([plaintext], { type: meta.mimeType }), mimeType: meta.mimeType };
}

// ─── Delete ───────────────────────────────────────────────────────────
export async function deleteFile(fileId: string): Promise<void> {
  await asJson(await fetch(`/api/files/${fileId}`, { method: "DELETE" }));
}
