// M4: quota + rate-limit smoke. Run the server with tight limits, e.g.:
//   MAX_VAULT_BYTES=5000 RL_OPEN_MAX=2 PORT=4188 npm start
//   BASE=http://localhost:4188 npm run smoke:limits

import assert from "node:assert/strict";

const BASE = process.env.BASE ?? "http://localhost:4000";
const subtle = globalThis.crypto.subtle;
const b64 = (b: ArrayBuffer | Uint8Array) => Buffer.from(b as any).toString("base64");
const encName = b64(new TextEncoder().encode("ENC(x)"));

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

function upload(auth: Record<string, string>, bytes: number) {
  return fetch(`${BASE}/files`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/octet-stream", "x-enc-name": encName },
    body: crypto.getRandomValues(new Uint8Array(bytes)),
  });
}

async function main() {
  const auth = await authedVault();

  // ── Quota (server started with MAX_VAULT_BYTES=5000) ──
  assert.equal((await upload(auth, 2000)).status, 201, "first upload under quota");
  assert.equal((await upload(auth, 4000)).status, 413, "upload exceeding vault quota → 413");

  // ── Rate limit on anonymous opens (server started with RL_OPEN_MAX=2) ──
  const share = (await (await fetch(`${BASE}/shares`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/octet-stream", "x-enc-name": encName, "x-owner-label": encName },
    body: crypto.getRandomValues(new Uint8Array(100)),
  })).json()) as any;

  assert.equal((await fetch(`${BASE}/shares/${share.id}`)).status, 200, "open 1 ok");
  assert.equal((await fetch(`${BASE}/shares/${share.id}`)).status, 200, "open 2 ok");
  assert.equal((await fetch(`${BASE}/shares/${share.id}`)).status, 429, "open 3 → rate limited");

  console.log("✓ all limits smoke checks passed");
}

main().catch((e) => {
  console.error("✗ limits smoke failed:", e.message);
  process.exit(1);
});
