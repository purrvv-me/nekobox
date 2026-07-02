// End-to-end smoke test: exercises the whole backend the way a real client
// would, including the ECDSA challenge–response auth. Run the server first
// (`npm start`), then `npm run smoke`.

import assert from "node:assert/strict";

const BASE = process.env.BASE ?? "http://localhost:4000";
const subtle = globalThis.crypto.subtle;
const b64 = (b: ArrayBuffer | Uint8Array) => Buffer.from(b as any).toString("base64");

async function main() {
  // 1. Client generates its vault auth identity (ECDSA P-256).
  const pair = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const spki = await subtle.exportKey("spki", pair.publicKey);
  const vaultId = "vault_" + b64(crypto.getRandomValues(new Uint8Array(9))).replace(/[^a-z0-9]/gi, "");

  // 2. Register the vault (server stores only the public key).
  let r = await fetch(`${BASE}/vaults`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ vaultId, authPublicKey: b64(spki) }),
  });
  assert.equal(r.status, 201, "register vault");

  // 3. Auth: get a nonce, sign it, exchange for a token.
  r = await fetch(`${BASE}/auth/challenge`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ vaultId }),
  });
  const { nonce } = (await r.json()) as any;
  const sig = await subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    pair.privateKey,
    Buffer.from(nonce, "base64"),
  );
  r = await fetch(`${BASE}/auth/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ vaultId, nonce, signature: b64(sig) }),
  });
  assert.equal(r.status, 200, "auth verify");
  const { token } = (await r.json()) as any;
  const auth = { authorization: `Bearer ${token}` };

  // A bad signature must be rejected.
  const badChallenge = (await (await fetch(`${BASE}/auth/challenge`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ vaultId }) })).json()) as any;
  const bad = await fetch(`${BASE}/auth/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ vaultId, nonce: badChallenge.nonce, signature: b64(crypto.getRandomValues(new Uint8Array(64))) }) });
  assert.equal(bad.status, 401, "reject bad signature");

  // Unauthenticated access is blocked.
  assert.equal((await fetch(`${BASE}/files`)).status, 401, "no token → 401");

  // 4. Upload an (opaque) encrypted blob.
  const payload = crypto.getRandomValues(new Uint8Array(4096));
  const encName = b64(new TextEncoder().encode("ENC(secret-photo.png)"));
  r = await fetch(`${BASE}/files`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/octet-stream", "x-enc-name": encName },
    body: payload,
  });
  assert.equal(r.status, 201, "upload");
  const uploaded = (await r.json()) as any;
  assert.equal(uploaded.size, payload.length, "stored size matches");

  // 5. List.
  r = await fetch(`${BASE}/files`, { headers: auth });
  const { files } = (await r.json()) as any;
  assert.ok(files.find((f: any) => f.id === uploaded.id), "listed");
  assert.equal(files[0].encName, encName, "encrypted name preserved verbatim");

  // 6. Download and byte-compare.
  r = await fetch(`${BASE}/files/${uploaded.id}`, { headers: auth });
  assert.equal(r.headers.get("x-enc-name"), encName, "enc name header round-trips");
  const back = new Uint8Array(await r.arrayBuffer());
  assert.deepEqual(back, payload, "downloaded bytes identical");

  // 7. Rename.
  const newName = b64(new TextEncoder().encode("ENC(renamed.png)"));
  r = await fetch(`${BASE}/files/${uploaded.id}`, { method: "PATCH", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ encName: newName }) });
  assert.equal(r.status, 200, "rename");

  // 8. Delete.
  r = await fetch(`${BASE}/files/${uploaded.id}`, { method: "DELETE", headers: auth });
  assert.equal(r.status, 204, "delete");
  r = await fetch(`${BASE}/files`, { headers: auth });
  assert.equal(((await r.json()) as any).files.length, 0, "empty after delete");

  console.log("✓ all smoke checks passed");
}

main().catch((e) => {
  console.error("✗ smoke test failed:", e.message);
  process.exit(1);
});
