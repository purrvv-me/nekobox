// Glue between the Stage 1 crypto module (@secure) and the Stage 2 backend.
//
// Everything sensitive lives on the client:
//   • the vault keyset (master key wrapped by password + recovery code)
//   • an ECDSA auth keypair whose private key is wrapped under the master key
// The server only ever receives ciphertext blobs, encrypted names, and the
// vault's PUBLIC auth key.

import {
  createVault,
  unlockWithPassword,
  resetPasswordWithRecovery,
  encryptBytes,
  decryptBytes,
  seal,
  open,
  utf8,
  fromUtf8,
  toBase64,
  fromBase64,
  sealShare,
  openShare,
  openShareName,
  type VaultKeyset,
  type Sealed,
} from "@secure";
import { api } from "./api";

export interface ShareSettings {
  ttlSeconds?: number; // undefined = never expires
  maxOpens?: number; // undefined = unlimited
}
export interface OwnerShareItem {
  id: string;
  name: string; // decrypted from the owner label
  size: number;
  createdAt: number;
  expiresAt: number | null;
  maxOpens: number | null;
  opens: number;
}

const LS_KEY = "nekobox.stage3.vault";
const subtle = crypto.subtle;

interface StoredVault {
  vaultId: string;
  keyset: VaultKeyset;
  authPubSpki: string; // base64 SPKI (public, registered with the server)
  wrappedAuthPriv: Sealed; // ECDSA pkcs8 private key, sealed under the master key
}

export interface VaultItem {
  id: string;
  name: string; // decrypted client-side
  size: number;
  createdAt: number;
}

export function hasLocalVault(): boolean {
  return localStorage.getItem(LS_KEY) !== null;
}
export function forgetLocalVault(): void {
  localStorage.removeItem(LS_KEY);
}
function load(): StoredVault {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) throw new Error("No vault on this device");
  return JSON.parse(raw) as StoredVault;
}
function save(v: StoredVault): void {
  localStorage.setItem(LS_KEY, JSON.stringify(v));
}

async function makeAuthIdentity(masterKey: CryptoKey) {
  const pair = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const spki = await subtle.exportKey("spki", pair.publicKey);
  const pkcs8 = await subtle.exportKey("pkcs8", pair.privateKey);
  const wrappedAuthPriv = await seal(masterKey, new Uint8Array(pkcs8));
  return { authPubSpki: toBase64(spki), wrappedAuthPriv };
}

async function importAuthPriv(masterKey: CryptoKey, wrapped: Sealed): Promise<CryptoKey> {
  const pkcs8 = await open(masterKey, wrapped);
  return subtle.importKey("pkcs8", pkcs8, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

/** Create a brand-new vault on this device and register it with the server. */
export async function createLocalVault(password: string): Promise<{ recoveryCode: string; session: Session }> {
  const { keyset, masterKey, recoveryCode } = await createVault(password);
  const { authPubSpki, wrappedAuthPriv } = await makeAuthIdentity(masterKey);
  const vaultId = "vault_" + b64url(crypto.getRandomValues(new Uint8Array(12)));

  await api.registerVault(vaultId, authPubSpki);
  save({ vaultId, keyset, authPubSpki, wrappedAuthPriv });

  const authPriv = await importAuthPriv(masterKey, wrappedAuthPriv);
  const session = new Session(vaultId, masterKey, authPriv);
  await session.authenticate();
  return { recoveryCode, session };
}

/** Unlock the existing device vault with the password. */
export async function unlock(password: string): Promise<Session> {
  const v = load();
  const masterKey = await unlockWithPassword(v.keyset, password); // throws on wrong password
  const authPriv = await importAuthPriv(masterKey, v.wrappedAuthPriv);
  const session = new Session(v.vaultId, masterKey, authPriv);
  await session.authenticate();
  return session;
}

/** Recover with the recovery code and set a new password. */
export async function recover(code: string, newPassword: string): Promise<Session> {
  const v = load();
  const { keyset, masterKey } = await resetPasswordWithRecovery(v.keyset, code, newPassword);
  save({ ...v, keyset });
  const authPriv = await importAuthPriv(masterKey, v.wrappedAuthPriv);
  const session = new Session(v.vaultId, masterKey, authPriv);
  await session.authenticate();
  return session;
}

/** An unlocked, authenticated session. All crypto happens in its methods. */
export class Session {
  private token: string | null = null;
  constructor(
    public readonly vaultId: string,
    private readonly masterKey: CryptoKey,
    private readonly authPriv: CryptoKey,
  ) {}

  /** Prove key possession by signing a server nonce → obtain a bearer token. */
  async authenticate(): Promise<void> {
    const { nonce } = await api.challenge(this.vaultId);
    const sig = await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, this.authPriv, fromBase64(nonce));
    const { token } = await api.verify(this.vaultId, nonce, toBase64(sig));
    this.token = token;
  }

  private async withAuth<T>(fn: (t: string) => Promise<T>): Promise<T> {
    if (!this.token) await this.authenticate();
    try {
      return await fn(this.token!);
    } catch (e) {
      if ((e as { status?: number }).status === 401) {
        await this.authenticate(); // token expired → re-auth once
        return fn(this.token!);
      }
      throw e;
    }
  }

  async list(): Promise<VaultItem[]> {
    const { files } = await this.withAuth((t) => api.list(t));
    return Promise.all(
      files.map(async (f) => ({
        id: f.id,
        size: f.size,
        createdAt: f.createdAt,
        name: await this.decName(f.encName),
      })),
    );
  }

  async upload(file: File): Promise<void> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const framed = await encryptBytes(this.masterKey, bytes); // Stage-1 chunked format
    const encName = await this.encName(file.name);
    await this.withAuth((t) => api.upload(t, encName, new Blob([framed])));
  }

  async getDecrypted(item: VaultItem, mime = "application/octet-stream"): Promise<Blob> {
    const { blob } = await this.withAuth((t) => api.download(t, item.id));
    const framed = new Uint8Array(await blob.arrayBuffer());
    const plain = await decryptBytes(this.masterKey, framed);
    return new Blob([plain], { type: mime });
  }

  async download(item: VaultItem): Promise<void> {
    saveBlob(await this.getDecrypted(item), item.name);
  }

  async rename(item: VaultItem, newName: string): Promise<void> {
    const encName = await this.encName(newName);
    await this.withAuth((t) => api.rename(t, item.id, encName));
  }

  async remove(item: VaultItem): Promise<void> {
    await this.withAuth((t) => api.remove(t, item.id));
  }

  // ── sharing ──
  /**
   * Create an anonymous share link. The file is re-encrypted under a FRESH
   * random share key (never the master key); that key is returned as a URL
   * fragment and never sent to the server.
   */
  async createShare(item: VaultItem, settings: ShareSettings): Promise<{ id: string; fragment: string; url: string }> {
    const plain = new Uint8Array(await (await this.getDecrypted(item)).arrayBuffer());
    const pkg = await sealShare(plain, item.name);
    const ownerLabel = await this.encName(item.name); // sealed under the owner's key for the owner's list
    const created = await this.withAuth((t) =>
      api.createShare(
        t,
        { encName: pkg.encName, ownerLabel, ttlSeconds: settings.ttlSeconds, maxOpens: settings.maxOpens },
        new Blob([pkg.blob]),
      ),
    );
    const url = `${location.origin}${location.pathname}#/s/${created.id}/${pkg.fragment}`;
    return { id: created.id, fragment: pkg.fragment, url };
  }

  async listShares(): Promise<OwnerShareItem[]> {
    const { shares } = await this.withAuth((t) => api.listShares(t));
    return Promise.all(
      shares.map(async (s) => ({
        id: s.id,
        size: s.size,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        maxOpens: s.maxOpens,
        opens: s.opens,
        name: await this.decName(s.ownerLabel),
      })),
    );
  }

  async revokeShare(id: string): Promise<void> {
    await this.withAuth((t) => api.revokeShare(t, id));
  }

  private async encName(name: string): Promise<string> {
    const sealed = await seal(this.masterKey, utf8(name));
    return toBase64(utf8(JSON.stringify(sealed)));
  }
  private async decName(encName: string): Promise<string> {
    try {
      const sealed = JSON.parse(fromUtf8(fromBase64(encName))) as Sealed;
      return fromUtf8(await open(this.masterKey, sealed));
    } catch {
      return "⚠ undecryptable";
    }
  }
}

// ── Anonymous recipient side (no account, no session) ──
export interface OpenedShare {
  name: string;
  blob: Blob;
  size: number;
}

/** Peek a shared file's name without consuming an open. */
export async function peekShare(id: string, fragment: string): Promise<{ name: string; size: number; expiresAt: number | null; opensRemaining: number | null }> {
  const meta = await api.shareMeta(id);
  const name = await openShareName(fragment, meta.encName);
  return { name, size: meta.size, expiresAt: meta.expiresAt, opensRemaining: meta.opensRemaining };
}

/** Download + locally decrypt a shared file using the key from the URL fragment. */
export async function openSharedLink(id: string, fragment: string): Promise<OpenedShare> {
  const { blob, encName } = await api.shareDownload(id);
  const framed = new Uint8Array(await blob.arrayBuffer());
  const { data, name } = await openShare(fragment, framed, encName);
  return { name, blob: new Blob([data]), size: data.length };
}

/** Parse `#/s/<id>/<fragment>` from the current location. */
export function parseShareHash(hash: string): { id: string; fragment: string } | null {
  const m = hash.match(/^#\/s\/([^/]+)\/(.+)$/);
  return m ? { id: decodeURIComponent(m[1]), fragment: m[2] } : null;
}

// small helpers
function b64url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
