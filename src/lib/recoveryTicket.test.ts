import { describe, it, expect } from "vitest";
import {
  createRecoveryTicket,
  verifyRecoveryTicket,
  hashEmail,
  normalizeEmail,
} from "./recoveryTicket";

const SECRET = "test-secret-at-least-16-chars";

describe("email hashing", () => {
  it("is deterministic and normalizes case/whitespace", async () => {
    const a = await hashEmail("k1", "User@Example.com ");
    const b = await hashEmail("k1", "user@example.com");
    expect(a).toBe(b);
    expect(normalizeEmail("  A@B.C ")).toBe("a@b.c");
  });

  it("different keys produce unrelated hashes (key separation)", async () => {
    const a = await hashEmail("k1", "user@example.com");
    const b = await hashEmail("k2", "user@example.com");
    expect(a).not.toBe(b);
  });

  it("different emails produce different hashes", async () => {
    expect(await hashEmail("k1", "a@x.com")).not.toBe(await hashEmail("k1", "b@x.com"));
  });
});

describe("recovery tickets", () => {
  it("round-trips a valid ticket", async () => {
    const token = await createRecoveryTicket(SECRET, "user_1", "jti_abc");
    const t = await verifyRecoveryTicket(SECRET, token);
    expect(t).toEqual({ userId: "user_1", jti: "jti_abc" });
  });

  it("rejects an expired ticket", async () => {
    const token = await createRecoveryTicket(SECRET, "user_1", "jti_abc", -10);
    expect(await verifyRecoveryTicket(SECRET, token)).toBeNull();
  });

  it("rejects a tampered ticket and a wrong secret", async () => {
    const token = await createRecoveryTicket(SECRET, "user_1", "jti_abc");
    expect(await verifyRecoveryTicket(SECRET, token.slice(0, -3) + "AAA")).toBeNull();
    expect(await verifyRecoveryTicket("other-secret-16-chars!!", token)).toBeNull();
  });

  it("rejects tokens with a different purpose (e.g. a session JWT)", async () => {
    // A session-style token signed with the same secret must NOT pass.
    const { SignJWT } = await import("jose");
    const sessionish = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user_1")
      .setJti("jti_abc")
      .setExpirationTime("15m")
      .sign(new TextEncoder().encode(SECRET));
    expect(await verifyRecoveryTicket(SECRET, sessionish)).toBeNull();
  });
});
