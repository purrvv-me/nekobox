import { describe, it, expect } from "vitest";
import { decoyRecoveryMaterial } from "./authDecoy";

const SECRET = "server-secret-abc";

describe("decoy recovery material (enumeration resistance)", () => {
  it("is deterministic for the same email + secret (no per-request tell)", () => {
    const a = decoyRecoveryMaterial(SECRET, "user@example.com");
    const b = decoyRecoveryMaterial(SECRET, "user@example.com");
    expect(a).toEqual(b);
  });

  it("differs per email and per server secret", () => {
    const base = decoyRecoveryMaterial(SECRET, "a@x.com");
    expect(decoyRecoveryMaterial(SECRET, "b@x.com")).not.toEqual(base);
    expect(decoyRecoveryMaterial("other-secret", "a@x.com")).not.toEqual(base);
  });

  it("has the same shape/sizes as real material (16/48/12 bytes b64)", () => {
    const m = decoyRecoveryMaterial(SECRET, "a@x.com");
    expect(Buffer.from(m.recoverySalt, "base64").length).toBe(16);
    expect(Buffer.from(m.recoveryWrappedVmk, "base64").length).toBe(48);
    expect(Buffer.from(m.recoveryWrappedVmkIv, "base64").length).toBe(12);
  });
});
