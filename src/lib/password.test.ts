import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, verifyPasswordDummy } from "./password";

describe("password hashing (argon2id)", () => {
  it("verifies a correct password and rejects a wrong one", async () => {
    const hash = await hashPassword("s3cure-pass");
    expect(await verifyPassword(hash, "s3cure-pass")).toBe(true);
    expect(await verifyPassword(hash, "wrong")).toBe(false);
  });

  it("verifyPassword never throws on a malformed hash", async () => {
    expect(await verifyPassword("not-a-hash", "x")).toBe(false);
  });

  it("verifyPasswordDummy resolves and performs real argon2 work (constant-time)", async () => {
    const t0 = performance.now();
    await verifyPasswordDummy("anything"); // first call also derives the dummy hash
    await verifyPasswordDummy("anything");
    const perCall = (performance.now() - t0) / 2;
    // Argon2id with 19 MiB / t=2 is far from free; a no-op path would be ~0ms.
    expect(perCall).toBeGreaterThan(3);
  });
});
