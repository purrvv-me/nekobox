import { afterEach, describe, expect, it } from "vitest";
import { emailRecoveryEnabled } from "./featureFlags";

afterEach(() => {
  delete process.env.ENABLE_EMAIL_RECOVERY;
});

describe("emailRecoveryEnabled", () => {
  it("defaults to disabled when unset", () => {
    expect(emailRecoveryEnabled()).toBe(false);
  });

  it("is enabled only when explicitly set to the string 'true'", () => {
    process.env.ENABLE_EMAIL_RECOVERY = "true";
    expect(emailRecoveryEnabled()).toBe(true);
  });

  it("stays disabled for any other value", () => {
    for (const v of ["false", "1", "", "TRUE", "yes"]) {
      process.env.ENABLE_EMAIL_RECOVERY = v;
      expect(emailRecoveryEnabled()).toBe(false);
    }
  });
});
