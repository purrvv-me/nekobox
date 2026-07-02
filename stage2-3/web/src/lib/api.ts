// Thin client for the Stage 2 "dumb storage" backend. Talks only in ciphertext:
// blobs are opaque, names are already encrypted before they get here.

const BASE = (import.meta.env.VITE_API as string) ?? "http://localhost:4000";

export interface ServerFile {
  id: string;
  encName: string; // base64 of the client-encrypted name
  size: number;
  createdAt: number;
}

async function json<T>(p: Promise<Response>): Promise<T> {
  const res = await p;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error ?? `HTTP ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

export const api = {
  registerVault: (vaultId: string, authPublicKey: string) =>
    json<{ vaultId: string }>(
      fetch(`${BASE}/vaults`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vaultId, authPublicKey }),
      }),
    ),

  challenge: (vaultId: string) =>
    json<{ nonce: string }>(
      fetch(`${BASE}/auth/challenge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vaultId }),
      }),
    ),

  verify: (vaultId: string, nonce: string, signature: string) =>
    json<{ token: string; expiresIn: number }>(
      fetch(`${BASE}/auth/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vaultId, nonce, signature }),
      }),
    ),

  list: (token: string) =>
    json<{ files: ServerFile[] }>(fetch(`${BASE}/files`, { headers: auth(token) })),

  upload: (token: string, encName: string, blob: Blob) =>
    json<ServerFile>(
      fetch(`${BASE}/files`, {
        method: "POST",
        headers: { ...auth(token), "content-type": "application/octet-stream", "x-enc-name": encName },
        body: blob,
      }),
    ),

  download: async (token: string, id: string): Promise<{ blob: Blob; encName: string }> => {
    const res = await fetch(`${BASE}/files/${id}`, { headers: auth(token) });
    if (!res.ok) throw new Error(`download failed (${res.status})`);
    return { blob: await res.blob(), encName: res.headers.get("x-enc-name") ?? "" };
  },

  rename: (token: string, id: string, encName: string) =>
    json<{ id: string }>(
      fetch(`${BASE}/files/${id}`, {
        method: "PATCH",
        headers: { ...auth(token), "content-type": "application/json" },
        body: JSON.stringify({ encName }),
      }),
    ),

  remove: async (token: string, id: string) => {
    const res = await fetch(`${BASE}/files/${id}`, { method: "DELETE", headers: auth(token) });
    if (!res.ok && res.status !== 204) throw new Error(`delete failed (${res.status})`);
  },

  // ── shares ──
  createShare: (
    token: string,
    headers: { encName: string; ownerLabel: string; ttlSeconds?: number; maxOpens?: number },
    blob: Blob,
  ) =>
    json<ShareCreated>(
      fetch(`${BASE}/shares`, {
        method: "POST",
        headers: {
          ...auth(token),
          "content-type": "application/octet-stream",
          "x-enc-name": headers.encName,
          "x-owner-label": headers.ownerLabel,
          ...(headers.ttlSeconds ? { "x-ttl-seconds": String(headers.ttlSeconds) } : {}),
          ...(headers.maxOpens ? { "x-max-opens": String(headers.maxOpens) } : {}),
        },
        body: blob,
      }),
    ),

  listShares: (token: string) =>
    json<{ shares: OwnerShare[] }>(fetch(`${BASE}/shares`, { headers: auth(token) })),

  revokeShare: async (token: string, id: string) => {
    const res = await fetch(`${BASE}/shares/${id}`, { method: "DELETE", headers: auth(token) });
    if (!res.ok && res.status !== 204) throw new Error(`revoke failed (${res.status})`);
  },

  // Anonymous recipient endpoints (no token). The key stays in the URL fragment.
  shareMeta: (id: string) =>
    json<{ encName: string; size: number; expiresAt: number | null; opensRemaining: number | null }>(
      fetch(`${BASE}/shares/${id}/meta`, { referrerPolicy: "no-referrer" }),
    ),

  shareDownload: async (id: string): Promise<{ blob: Blob; encName: string }> => {
    const res = await fetch(`${BASE}/shares/${id}`, { referrerPolicy: "no-referrer" });
    if (res.status === 410) throw new Error("This link has expired or reached its open limit.");
    if (res.status === 404) throw new Error("This link is invalid or was revoked.");
    if (!res.ok) throw new Error(`open failed (${res.status})`);
    return { blob: await res.blob(), encName: res.headers.get("x-enc-name") ?? "" };
  },
};

export interface ShareCreated {
  id: string;
  size: number;
  createdAt: number;
  expiresAt: number | null;
  maxOpens: number | null;
}
export interface OwnerShare {
  id: string;
  ownerLabel: string;
  size: number;
  createdAt: number;
  expiresAt: number | null;
  maxOpens: number | null;
  opens: number;
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });
