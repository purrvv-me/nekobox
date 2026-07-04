import { afterEach, describe, expect, it } from "vitest";
import { emailRecoveryEnabled } from "./featureFlags";

afterEach(() => {
  delete process.env.ENABLE_EMAIL_RECOVERY;
});

describe("emailRecoveryEnabled", () => {
  it("defaults to enabled when unset", () => {
    expect(emailRecoveryEnabled()).toBe(true);
  });

  it("is disabled only when explicitly set to the string 'false'", () => {
    process.env.ENABLE_EMAIL_RECOVERY = "false";
    expect(emailRecoveryEnabled()).toBe(false);
  });

  it("stays enabled for any other value (true/1/empty string/etc.)", () => {
    for (const v of ["true", "1", "", "FALSE", "no"]) {
      process.env.ENABLE_EMAIL_RECOVERY = v;
      expect(emailRecoveryEnabled()).toBe(true);
    }
  });
});
