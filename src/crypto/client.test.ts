import { describe, it, expect } from "vitest";
import {
  deriveKEK,
  generateVmk,
  wrapVmk,
  unwrapVmk,
  generateRecoveryCode,
  normalizeRecoveryCode,
  deriveRecoveryKey,
  newSaltB64,
  generateDek,
  wrapDekWithMaster,
  unwrapDekWithMaster,
  aesEncryptString,
  aesDecryptString,
  generateWrappedKeypair,
  importPrivateKey,
  importPublicKey,
  wrapDekForRecipient,
  unwrapDekFromSender,
  encryptFileChunked,
  decryptFileChunked,
  bufToB64,
  b64ToBuf,
} from "./client";

const td = new TextDecoder();
const te = new TextEncoder();

describe("KEK / VMK hierarchy", () => {
  it("wraps and unwraps the VMK under the password key", async () => {
    const salt = newSaltB64();
    const kek = await deriveKEK("correct horse battery staple", salt);
    const vmk = await generateVmk();
    const sealed = await wrapVmk(kek, vmk);

    const kek2 = await deriveKEK("correct horse battery staple", salt);
    const vmk2 = await unwrapVmk(kek2, sealed);

    // Prove they are the same key by a wrap/unwrap roundtrip of a DEK.
    const dek = await generateDek();
    const wrapped = await wrapDekWithMaster(vmk, dek);
    const dek2 = await unwrapDekWithMaster(vmk2, wrapped);
    const probe = await aesEncryptString(dek, "hello");
    expect(await aesDecryptString(dek2, probe)).toBe("hello");
  });

  it("fails to unwrap the VMK with the wrong password", async () => {
    const salt = newSaltB64();
    const kek = await deriveKEK("right-password", salt);
    const vmk = await generateVmk();
    const sealed = await wrapVmk(kek, vmk);
    const wrong = await deriveKEK("wrong-password", salt);
    await expect(unwrapVmk(wrong, sealed)).rejects.toBeTruthy();
  });
});

describe("recovery code", () => {
  it("normalizes formatting and recovers the VMK", async () => {
    const code = generateRecoveryCode();
    expect(code).toMatch(/^[A-Z2-7]{5}(-[A-Z2-7]+)+$/);
    const recSalt = newSaltB64();
    const rwk = await deriveRecoveryKey(code, recSalt);
    const vmk = await generateVmk();
    const sealed = await wrapVmk(rwk, vmk);

    // User types it back with lowercase + spaces instead of dashes.
    const typed = code.toLowerCase().replace(/-/g, " ");
    const rwk2 = await deriveRecoveryKey(typed, recSalt);
    const vmk2 = await unwrapVmk(rwk2, sealed);

    const dek = await generateDek();
    const w = await wrapDekWithMaster(vmk, dek);
    const dek2 = await unwrapDekWithMaster(vmk2, w);
    const probe = await aesEncryptString(dek, "secret");
    expect(await aesDecryptString(dek2, probe)).toBe("secret");
  });

  it("normalizeRecoveryCode strips noise", () => {
    expect(normalizeRecoveryCode("abc de-fg hi")).toBe("ABCDEFGHI");
  });
});

describe("password change re-wraps VMK only", () => {
  it("keeps data readable after re-wrapping under a new password", async () => {
    const salt = newSaltB64();
    const kek = await deriveKEK("old-pass", salt);
    const vmk = await generateVmk();
    await wrapVmk(kek, vmk);

    // Encrypt some data under the VMK.
    const dek = await generateDek();
    const wrappedDek = await wrapDekWithMaster(vmk, dek);
    const name = await aesEncryptString(vmk, "report.pdf");

    // Change password: derive a fresh KEK and re-wrap the SAME vmk.
    const newSalt = newSaltB64();
    const newKek = await deriveKEK("new-pass", newSalt);
    const reWrapped = await wrapVmk(newKek, vmk);

    // Log in fresh with the new password.
    const loginKek = await deriveKEK("new-pass", newSalt);
    const vmkAfter = await unwrapVmk(loginKek, reWrapped);
    const dekAfter = await unwrapDekWithMaster(vmkAfter, wrappedDek);
    const probe = await aesEncryptString(dek, "x");
    expect(await aesDecryptString(dekAfter, probe)).toBe("x");
    expect(await aesDecryptString(vmkAfter, name)).toBe("report.pdf");
  });
});

describe("RSA sharing", () => {
  it("wraps a DEK for a recipient and only they can unwrap it", async () => {
    const vmk = await generateVmk();
    const recipient = await generateWrappedKeypair(vmk);
    const pub = await importPublicKey(recipient.publicKey);
    const priv = await importPrivateKey(vmk, recipient.encPrivateKey, recipient.encPrivateKeyIv);

    const dek = await generateDek();
    const rsaWrapped = await wrapDekForRecipient(pub, dek);
    const dek2 = await unwrapDekFromSender(priv, rsaWrapped);

    const probe = await aesEncryptString(dek, "shared file");
    expect(await aesDecryptString(dek2, probe)).toBe("shared file");
  });
});

describe("chunked file encryption", () => {
  async function roundtrip(bytes: Uint8Array, chunkSize: number) {
    const dek = await generateDek();
    const buf = bytes.buffer.slice(0) as ArrayBuffer;
    const { blob, contentIv, chunkSize: cs } = await encryptFileChunked(dek, buf, chunkSize);
    const ct = await blob.arrayBuffer();
    const out = await decryptFileChunked(dek, ct, contentIv, cs);
    return new Uint8Array(out);
  }

  it("roundtrips data spanning many chunks", async () => {
    const data = te.encode("NekoBox ".repeat(50)); // > several 16-byte chunks
    const out = await roundtrip(data, 16);
    expect(td.decode(out)).toBe(td.decode(data));
  });

  it("roundtrips an exact chunk-boundary size", async () => {
    const data = new Uint8Array(64).map((_, i) => i);
    const out = await roundtrip(data, 16); // 64 = exactly 4 chunks
    expect([...out]).toEqual([...data]);
  });

  it("roundtrips an empty file", async () => {
    const out = await roundtrip(new Uint8Array(0), 16);
    expect(out.length).toBe(0);
  });

  it("detects tampering (auth tag)", async () => {
    const dek = await generateDek();
    const data = te.encode("tamper me");
    const { blob, contentIv, chunkSize } = await encryptFileChunked(dek, data.buffer.slice(0) as ArrayBuffer, 16);
    const ct = new Uint8Array(await blob.arrayBuffer());
    ct[0] ^= 0xff; // flip a byte
    await expect(decryptFileChunked(dek, ct.buffer.slice(0) as ArrayBuffer, contentIv, chunkSize)).rejects.toBeTruthy();
  });
});

describe("base64 helpers", () => {
  it("roundtrips binary", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    expect([...b64ToBuf(bufToB64(bytes))]).toEqual([...bytes]);
  });
});
