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
  deriveMasterKey,
  DEFAULT_PBKDF2_ITERATIONS,
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
    // Stage-1 format: Crockford base32 (no I/L/O/U), dash-grouped by 4.
    expect(code).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4})+$/);
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

  it("normalizeRecoveryCode strips noise and maps look-alikes", () => {
    // Stage-1 (Crockford) semantics: uppercase, strip spaces/dashes, I/L→1, O→0.
    expect(normalizeRecoveryCode("abcd-efgh")).toBe("ABCDEFGH");
    expect(normalizeRecoveryCode("i o l 0")).toBe(normalizeRecoveryCode("1010"));
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

  // M2: chunk index + final flag are bound into the AAD.
  it("detects truncation (a dropped final chunk)", async () => {
    const dek = await generateDek();
    const data = new Uint8Array(48).map((_, i) => i); // exactly 3 chunks of 16
    const { blob, contentIv, chunkSize } = await encryptFileChunked(dek, data.buffer.slice(0) as ArrayBuffer, 16);
    const full = new Uint8Array(await blob.arrayBuffer());
    const truncated = full.slice(0, full.length - (16 + 16)); // drop last encrypted chunk
    await expect(
      decryptFileChunked(dek, truncated.buffer.slice(0) as ArrayBuffer, contentIv, chunkSize),
    ).rejects.toBeTruthy();
  });

  it("detects reordering of chunks", async () => {
    const dek = await generateDek();
    const data = new Uint8Array(48).map((_, i) => i);
    const { blob, contentIv, chunkSize } = await encryptFileChunked(dek, data.buffer.slice(0) as ArrayBuffer, 16);
    const ct = new Uint8Array(await blob.arrayBuffer());
    const HEADER = 17; // Stage-1 NBX1 stream header precedes the frames
    const enc = 16 + 16;
    // swap encrypted chunk 0 and chunk 1 (frames start after the header)
    const c0 = ct.slice(HEADER, HEADER + enc);
    const c1 = ct.slice(HEADER + enc, HEADER + enc * 2);
    ct.set(c1, HEADER);
    ct.set(c0, HEADER + enc);
    await expect(
      decryptFileChunked(dek, ct.buffer.slice(0) as ArrayBuffer, contentIv, chunkSize),
    ).rejects.toBeTruthy();
  });
});

describe("PBKDF2 iterations (M1)", () => {
  it("defaults to the OWASP 600k floor", () => {
    expect(DEFAULT_PBKDF2_ITERATIONS).toBe(600_000);
  });

  it("a per-user iteration count round-trips (same count → interoperable key)", async () => {
    const salt = newSaltB64();
    const k1 = await deriveMasterKey("pw", salt, 120_000);
    const k2 = await deriveMasterKey("pw", salt, 120_000);
    const sealed = await aesEncryptString(k1, "hi");
    expect(await aesDecryptString(k2, sealed)).toBe("hi");
  });

  it("different iteration counts derive different, non-interoperable keys", async () => {
    const salt = newSaltB64();
    const kOld = await deriveMasterKey("pw", salt, 200_000);
    const kNew = await deriveMasterKey("pw", salt, 600_000);
    const sealed = await aesEncryptString(kOld, "hi");
    await expect(aesDecryptString(kNew, sealed)).rejects.toBeTruthy();
  });
});

describe("base64 helpers", () => {
  it("roundtrips binary", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    expect([...b64ToBuf(bufToB64(bytes))]).toEqual([...bytes]);
  });
});
