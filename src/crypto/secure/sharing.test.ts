import { describe, it, expect } from "vitest";
import {
  generateShareKey,
  importShareKey,
  sealShare,
  openShare,
  openShareName,
  toFragment,
  fromFragment,
  randomBytes,
  utf8,
  fromUtf8,
} from "./index";

const eq = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

describe("sharing — fragment codec", () => {
  it("fragment is URL-safe and round-trips", () => {
    for (let i = 0; i < 20; i++) {
      const raw = randomBytes(32);
      const frag = toFragment(raw);
      expect(frag).toMatch(/^[A-Za-z0-9_-]+$/); // no '+', '/', '=', '#', '&'
      expect(eq(fromFragment(frag), raw)).toBe(true);
    }
  });

  it("rejects malformed fragments", async () => {
    await expect(importShareKey("too-short")).rejects.toThrow(/Invalid share key/);
    await expect(importShareKey(toFragment(randomBytes(16)))).rejects.toThrow(/Invalid share key/);
  });
});

describe("sharing — end to end", () => {
  it("creates a share and decrypts it via the fragment (content + name)", async () => {
    const data = randomBytes(50_000);
    const pkg = await sealShare(data, "vacation photo.png", { chunkSize: 4096 });

    const opened = await openShare(pkg.fragment, pkg.blob, pkg.encName);
    expect(eq(opened.data, data)).toBe(true);
    expect(opened.name).toBe("vacation photo.png");
  });

  it("every share gets a distinct key; blobs are not cross-decryptable", async () => {
    const a = await sealShare(utf8("file A"), "a.txt");
    const b = await sealShare(utf8("file B"), "b.txt");
    expect(a.fragment).not.toBe(b.fragment);
    await expect(openShare(b.fragment, a.blob, a.encName)).rejects.toThrow();
  });

  it("wrong key fails, tampered blob fails, tampered name fails", async () => {
    const pkg = await sealShare(utf8("secret"), "s.txt");

    const wrong = toFragment(randomBytes(32));
    await expect(openShare(wrong, pkg.blob, pkg.encName)).rejects.toThrow();

    const tampered = pkg.blob.slice();
    tampered[tampered.length - 1] ^= 0x01;
    await expect(openShare(pkg.fragment, tampered, pkg.encName)).rejects.toThrow();

    await expect(openShareName(pkg.fragment, pkg.encName.slice(0, -8) + "AAAAAAAA")).rejects.toThrow();
  });

  it("name can be decrypted alone (before downloading the body)", async () => {
    const pkg = await sealShare(utf8("body"), "report-Q3 🔒.pdf");
    expect(await openShareName(pkg.fragment, pkg.encName)).toBe("report-Q3 🔒.pdf");
  });

  it("share key is independent of any master key (pure random)", async () => {
    // Same plaintext shared twice → different fragments AND different ciphertext.
    const data = utf8("same content");
    const p1 = await sealShare(data, "x");
    const p2 = await sealShare(data, "x");
    expect(p1.fragment).not.toBe(p2.fragment);
    expect(eq(p1.blob, p2.blob)).toBe(false);
    // both decrypt correctly with their own fragment
    expect(fromUtf8((await openShare(p1.fragment, p1.blob, p1.encName)).data)).toBe("same content");
    expect(fromUtf8((await openShare(p2.fragment, p2.blob, p2.encName)).data)).toBe("same content");
  });
});
