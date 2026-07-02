// Share lifecycle smoke test: create → open (limit) → expiry → revoke → retry.
// Run the server first (`npm start`), then `npm run smoke:share`.

import assert from "node:assert/strict";

const BASE = process.env.BASE ?? "http://localhost:4000";
const subtle = globalThis.crypto.subtle;
const b64 = (b: ArrayBuffer | Uint8Array) => Buffer.from(b as any).toString("base64");

async function authedVault() {
  const pair = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const spki = await subtle.exportKey("spki", pair.publicKey);
  const vaultId = "vault_" + b64(crypto.getRandomValues(new Uint8Array(9))).replace(/[^a-z0-9]/gi, "");
  await fetch(`${BASE}/vaults`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ vaultId, authPublicKey: b64(spki) }) });
  const { nonce } = (await (await fetch(`${BASE}/auth/challenge`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ vaultId }) })).json()) as any;
  const sig = await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, Buffer.from(nonce, "base64"));
  const { token } = (await (await fetch(`${BASE}/auth/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ vaultId, nonce, signature: b64(sig) }) })).json()) as any;
  return { authorization: `Bearer ${token}` };
}

async function createShare(auth: Record<string, string>, headers: Record<string, string>, body: Uint8Array) {
  const r = await fetch(`${BASE}/shares`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/octet-stream", "x-enc-name": b64(new TextEncoder().encode("ENC(name)")), "x-owner-label": b64(new TextEncoder().encode("OWNER(name)")), ...headers },
    body,
  });
  return r;
}

async function main() {
  const auth = await authedVault();
  const blob = crypto.getRandomValues(new Uint8Array(2048));

  // 1. Create a one-time share.
  let r = await createShare(auth, { "x-max-opens": "1" }, blob);
  assert.equal(r.status, 201, "create share");
  const share = (await r.json()) as any;

  // 2. Recipient reads metadata without consuming an open (no auth needed).
  r = await fetch(`${BASE}/shares/${share.id}/meta`);
  assert.equal(r.status, 200, "meta before open");
  assert.equal(((await r.json()) as any).opensRemaining, 1, "one open remaining");

  // 3. Open it once (anonymous) → bytes come back.
  r = await fetch(`${BASE}/shares/${share.id}`);
  assert.equal(r.status, 200, "first open");
  assert.deepEqual(new Uint8Array(await r.arrayBuffer()), blob, "downloaded bytes identical");

  // 4. Second open must fail — one-time limit reached.
  assert.equal((await fetch(`${BASE}/shares/${share.id}`)).status, 410, "second open blocked");

  // 5. Expiry: create with a 1-second TTL, wait, then it's gone.
  r = await createShare(auth, { "x-ttl-seconds": "1" }, blob);
  const expiring = (await r.json()) as any;
  assert.equal((await fetch(`${BASE}/shares/${expiring.id}/meta`)).status, 200, "valid before expiry");
  await new Promise((res) => setTimeout(res, 1200));
  assert.equal((await fetch(`${BASE}/shares/${expiring.id}`)).status, 410, "expired open blocked");

  // 6. Revoke: create unlimited, confirm it opens, revoke, confirm it dies.
  r = await createShare(auth, {}, blob);
  const revocable = (await r.json()) as any;
  assert.equal((await fetch(`${BASE}/shares/${revocable.id}`)).status, 200, "opens before revoke");
  assert.equal((await fetch(`${BASE}/shares/${revocable.id}`, { method: "DELETE", headers: auth })).status, 204, "revoke");
  assert.equal((await fetch(`${BASE}/shares/${revocable.id}`)).status, 404, "revoked → dead");

  // 7. Only the owner can revoke — a different vault gets 404 (no IDOR).
  const other = await authedVault();
  r = await createShare(auth, {}, blob);
  const mine = (await r.json()) as any;
  assert.equal((await fetch(`${BASE}/shares/${mine.id}`, { method: "DELETE", headers: other })).status, 404, "cross-vault revoke blocked");
  assert.equal((await fetch(`${BASE}/shares/${mine.id}`)).status, 200, "still alive after failed cross-revoke");

  console.log("✓ all share smoke checks passed");
}

main().catch((e) => {
  console.error("✗ share smoke failed:", e.message);
  process.exit(1);
});
