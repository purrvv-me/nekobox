import { describe, it, expect } from "vitest";
import {
  // codec
  randomBytes,
  toBase64,
  fromBase64,
  utf8,
  fromUtf8,
  // kdf
  deriveKeyPBKDF2,
  deriveKeyArgon2id,
  isArgon2Available,
  // aes
  generateAesKey,
  seal,
  open,
  wrapKey,
  unwrapKey,
  // stream
  encryptBytes,
  decryptBytes,
  encryptStream,
  decryptStream,
  chunkedSource,
  collect,
  DEFAULT_CHUNK_SIZE,
  // recovery
  generateRecoveryCode,
  normalizeRecoveryCode,
  // keyset
  createVault,
  unlockWithPassword,
  unlockWithRecovery,
  changePassword,
  resetPasswordWithRecovery,
  rotateRecoveryCode,
} from "./index";

const eq = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);
const bytes = (n: number) => randomBytes(n);

describe("codec", () => {
  it("base64 round-trips arbitrary bytes", () => {
    const b = bytes(257);
    expect(eq(fromBase64(toBase64(b)), b)).toBe(true);
  });
  it("utf8 round-trips", () => {
    expect(fromUtf8(utf8("héllo 🐾 nekø"))).toBe("héllo 🐾 nekø");
  });
});

describe("KDF (PBKDF2)", () => {
  const params = { name: "PBKDF2", hash: "SHA-256", iterations: 1000 } as const;

  it("same password+salt derives an interoperable key", async () => {
    const salt = toBase64(bytes(16));
    const k1 = await deriveKeyPBKDF2("correct horse", salt, params);
    const k2 = await deriveKeyPBKDF2("correct horse", salt, params);
    const sealed = await seal(k1, utf8("secret"));
    expect(fromUtf8(await open(k2, sealed))).toBe("secret");
  });

  it("different salt derives a different (non-interoperable) key", async () => {
    const k1 = await deriveKeyPBKDF2("pw", toBase64(bytes(16)), params);
    const k2 = await deriveKeyPBKDF2("pw", toBase64(bytes(16)), params);
    const sealed = await seal(k1, utf8("secret"));
    await expect(open(k2, sealed)).rejects.toThrow();
  });

  it("Argon2id is available (hash-wasm) and derives a usable KEK", async () => {
    expect(await isArgon2Available()).toBe(true); // hash-wasm is a dependency
    const key = await deriveKeyArgon2id("pw", toBase64(randomBytes(16)));
    // The derived key must be a working AES-GCM KEK (seal/open round-trips).
    const sealed = await seal(key, utf8("secret"));
    expect(fromUtf8(await open(key, sealed))).toBe("secret");
  });
});

describe("AES-256-GCM seal/open", () => {
  it("round-trips and rejects wrong key / tamper / AAD mismatch", async () => {
    const key = await generateAesKey();
    const other = await generateAesKey();
    const aad = utf8("context");
    const sealed = await seal(key, utf8("top secret"), aad);

    expect(fromUtf8(await open(key, sealed, aad))).toBe("top secret");
    await expect(open(other, sealed, aad)).rejects.toThrow(); // wrong key
    await expect(open(key, sealed)).rejects.toThrow(); // missing AAD
    await expect(open(key, sealed, utf8("wrong"))).rejects.toThrow(); // wrong AAD

    const tampered = fromBase64(sealed.ct);
    tampered[0] ^= 0xff;
    await expect(open(key, { ...sealed, ct: toBase64(tampered) }, aad)).rejects.toThrow();
  });

  it("wraps and unwraps a key", async () => {
    const kek = await generateAesKey();
    const dek = await generateAesKey();
    const restored = await unwrapKey(kek, await wrapKey(kek, dek));
    // prove it's the same key: encrypt with dek, decrypt with restored
    const sealed = await seal(dek, utf8("data"));
    expect(fromUtf8(await open(restored, sealed))).toBe("data");
  });
});

describe("streaming chunked encryption", () => {
  const CHUNK = 16;

  it("round-trips across chunk boundaries (empty / partial / exact / multi)", async () => {
    const key = await generateAesKey();
    for (const size of [0, 1, 15, 16, 17, 32, 33, 100, 1000]) {
      const data = bytes(size);
      const framed = await encryptBytes(key, data, { chunkSize: CHUNK });
      const back = await decryptBytes(key, framed);
      expect(eq(back, data), `size ${size}`).toBe(true);
    }
  });

  it("is independent of how input is split into stream parts", async () => {
    const key = await generateAesKey();
    const data = bytes(250);
    // encrypt feeding the source in irregular 7-byte parts
    const framed = await collect(encryptStream(chunkedSource(data, 7), key, { chunkSize: CHUNK }));
    // decrypt feeding the framed bytes in irregular 5-byte parts
    const back = await collect(decryptStream(chunkedSource(framed, 5), key));
    expect(eq(back, data)).toBe(true);
  });

  it("uses a 1 MiB default chunk size", () => {
    expect(DEFAULT_CHUNK_SIZE).toBe(1024 * 1024);
  });

  it("detects a tampered body byte", async () => {
    const key = await generateAesKey();
    const framed = await encryptBytes(key, bytes(40), { chunkSize: CHUNK });
    framed[20] ^= 0x01; // flip a byte inside a frame
    await expect(decryptBytes(key, framed)).rejects.toThrow();
  });

  it("detects truncation (a dropped final chunk)", async () => {
    const key = await generateAesKey();
    // 3 full chunks → drop the last frame (CHUNK + 16 tag bytes)
    const framed = await encryptBytes(key, bytes(CHUNK * 3), { chunkSize: CHUNK });
    const truncated = framed.slice(0, framed.length - (CHUNK + 16));
    await expect(decryptBytes(key, truncated)).rejects.toThrow();
  });

  it("rejects a corrupt header", async () => {
    const key = await generateAesKey();
    const framed = await encryptBytes(key, bytes(20), { chunkSize: CHUNK });
    framed[0] ^= 0xff; // break the magic
    await expect(decryptBytes(key, framed)).rejects.toThrow(/magic/);
  });
});

describe("recovery code", () => {
  it("generates grouped high-entropy codes", () => {
    const code = generateRecoveryCode();
    expect(code).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4})+$/);
    expect(generateRecoveryCode()).not.toBe(generateRecoveryCode());
  });

  it("normalises spacing and look-alike characters", () => {
    // I→1, O→0, L→1, lowercase → upper, dashes/spaces removed
    expect(normalizeRecoveryCode("abcd-efgh")).toBe("ABCDEFGH");
    expect(normalizeRecoveryCode("i o l  o")).toBe(normalizeRecoveryCode("1 0 1 0"));
  });
});

describe("vault keyset (KEK/VMK + recovery flow)", () => {
  async function roundTripFile(key: CryptoKey) {
    const data = bytes(5000);
    return eq(await decryptBytes(key, await encryptBytes(key, data)), data);
  }

  it("unlocks with password AND recovery code", async () => {
    const { keyset, masterKey, recoveryCode } = await createVault("hunter2");

    // data encrypted under the created master key…
    const framed = await encryptBytes(masterKey, utf8("my files"));

    const byPassword = await unlockWithPassword(keyset, "hunter2");
    const byRecovery = await unlockWithRecovery(keyset, recoveryCode);
    expect(fromUtf8(await decryptBytes(byPassword, framed))).toBe("my files");
    expect(fromUtf8(await decryptBytes(byRecovery, framed))).toBe("my files");
  });

  it("rejects wrong password and wrong recovery code", async () => {
    const { keyset } = await createVault("hunter2");
    await expect(unlockWithPassword(keyset, "wrong")).rejects.toThrow(/Incorrect password/);
    await expect(unlockWithRecovery(keyset, "ZZZZ-ZZZZ-ZZZZ")).rejects.toThrow(/Invalid recovery/);
  });

  it("changes password without re-encrypting data", async () => {
    const { keyset, masterKey } = await createVault("old-pass");
    const framed = await encryptBytes(masterKey, utf8("stays valid"));

    const updated = await changePassword(keyset, masterKey, "new-pass");
    const key = await unlockWithPassword(updated, "new-pass");
    expect(fromUtf8(await decryptBytes(key, framed))).toBe("stays valid");
    await expect(unlockWithPassword(updated, "old-pass")).rejects.toThrow();
    // the same master key still opens old data
    expect(await roundTripFile(key)).toBe(true);
  });

  it("resets the password via the recovery code", async () => {
    const { keyset, masterKey, recoveryCode } = await createVault("forgotten");
    const framed = await encryptBytes(masterKey, utf8("recovered"));

    const { keyset: reset } = await resetPasswordWithRecovery(keyset, recoveryCode, "brand-new");
    const key = await unlockWithPassword(reset, "brand-new");
    expect(fromUtf8(await decryptBytes(key, framed))).toBe("recovered");
    await expect(unlockWithPassword(reset, "forgotten")).rejects.toThrow();
  });

  it("rotates the recovery code and invalidates the old one", async () => {
    const { keyset, masterKey, recoveryCode } = await createVault("pw");
    const { keyset: rotated, recoveryCode: fresh } = await rotateRecoveryCode(keyset, masterKey);

    expect(fresh).not.toBe(recoveryCode);
    await expect(unlockWithRecovery(rotated, recoveryCode)).rejects.toThrow(); // old dead
    const key = await unlockWithRecovery(rotated, fresh); // new works
    expect(await roundTripFile(key)).toBe(true);
    // password slot untouched
    expect(await roundTripFile(await unlockWithPassword(rotated, "pw"))).toBe(true);
  });

  it("keyset is JSON-serialisable (safe to persist)", async () => {
    const { keyset } = await createVault("pw");
    const clone = JSON.parse(JSON.stringify(keyset));
    expect(await roundTripFile(await unlockWithPassword(clone, "pw"))).toBe(true);
  });
});
