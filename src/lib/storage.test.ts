import { afterEach, describe, expect, it, vi } from "vitest";
import { cloudStorageConfigured, isB2Configured, isR2Configured, presignUpload } from "./storage";

const B2_VARS = ["B2_ACCESS_KEY_ID", "B2_SECRET_ACCESS_KEY", "B2_BUCKET", "B2_ENDPOINT"];
const R2_VARS = ["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_ACCOUNT_ID"];

afterEach(() => {
  for (const v of [...B2_VARS, ...R2_VARS]) delete process.env[v];
  delete process.env.ALLOW_LOCAL_STORAGE;
  vi.unstubAllEnvs();
});

describe("isB2Configured", () => {
  it("false when nothing is set", () => {
    expect(isB2Configured()).toBe(false);
  });

  it("true once all four real-looking vars are set", () => {
    process.env.B2_ACCESS_KEY_ID = "key123";
    process.env.B2_SECRET_ACCESS_KEY = "secret123";
    process.env.B2_BUCKET = "nekobox-vault";
    process.env.B2_ENDPOINT = "https://s3.us-west-004.backblazeb2.com";
    expect(isB2Configured()).toBe(true);
  });

  it("false when any one var is missing", () => {
    process.env.B2_ACCESS_KEY_ID = "key123";
    process.env.B2_SECRET_ACCESS_KEY = "secret123";
    process.env.B2_BUCKET = "nekobox-vault";
    // B2_ENDPOINT deliberately left unset
    expect(isB2Configured()).toBe(false);
  });

  it("false for .env.example placeholder values", () => {
    process.env.B2_ACCESS_KEY_ID = "your-key-id";
    process.env.B2_SECRET_ACCESS_KEY = "your-secret";
    process.env.B2_BUCKET = "nekobox-vault";
    process.env.B2_ENDPOINT = "https://s3.us-west-004.backblazeb2.com";
    expect(isB2Configured()).toBe(false);
  });
});

describe("isR2Configured", () => {
  it("false when nothing is set", () => {
    expect(isR2Configured()).toBe(false);
  });

  it("true once real-looking vars are set", () => {
    process.env.R2_ACCESS_KEY_ID = "key123";
    process.env.R2_SECRET_ACCESS_KEY = "secret123";
    process.env.R2_BUCKET = "nekobox-vault";
    process.env.R2_ACCOUNT_ID = "abc123accountid";
    expect(isR2Configured()).toBe(true);
  });

  it("false for .env.example placeholder values", () => {
    process.env.R2_ACCESS_KEY_ID = "your-access-key-id";
    process.env.R2_SECRET_ACCESS_KEY = "your-secret-access-key";
    process.env.R2_BUCKET = "nekobox-vault";
    process.env.R2_ACCOUNT_ID = "your-account-id";
    expect(isR2Configured()).toBe(false);
  });
});

describe("B2 and R2 can be independently detected (B2 takes precedence in storage.ts)", () => {
  it("both can report true at once — the caller (presignUpload etc.) picks B2 first", () => {
    process.env.B2_ACCESS_KEY_ID = "key123";
    process.env.B2_SECRET_ACCESS_KEY = "secret123";
    process.env.B2_BUCKET = "nekobox-vault";
    process.env.B2_ENDPOINT = "https://s3.us-west-004.backblazeb2.com";
    process.env.R2_ACCESS_KEY_ID = "key123";
    process.env.R2_SECRET_ACCESS_KEY = "secret123";
    process.env.R2_BUCKET = "nekobox-vault";
    process.env.R2_ACCOUNT_ID = "abc123accountid";
    expect(isB2Configured()).toBe(true);
    expect(isR2Configured()).toBe(true);
    expect(cloudStorageConfigured()).toBe(true);
  });
});

describe("production storage configuration", () => {
  it("fails closed instead of using local disk in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(presignUpload("user/file", "application/octet-stream", 10)).rejects.toThrow(
      "Cloud storage is not configured",
    );
  });
});
