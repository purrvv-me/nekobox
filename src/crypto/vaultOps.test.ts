import { afterEach, describe, expect, it, vi } from "vitest";
import { encryptFileChunked, generateDek, generateVmk, wrapDekWithMaster } from "./client";
import { downloadAndDecrypt, uploadFile } from "./vaultOps";

afterEach(() => {
  vi.restoreAllMocks();
});

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    status: init?.status ?? 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("uploadFile", () => {
  it("falls back to same-origin encrypted upload when direct storage PUT fails", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      if (url === "/api/files/upload-url") {
        return json({ storageKey: "user-1/object-1", uploadUrl: "https://storage.example/object-1" });
      }
      if (url === "https://storage.example/object-1") {
        return new Response("B2 rejected PUT", { status: 403, statusText: "Forbidden" });
      }
      if (url === "/api/files/upload") {
        return json({ ok: true });
      }
      if (url === "/api/files") {
        return json({ id: "file-1", createdAt: new Date().toISOString() }, { status: 201 });
      }
      return new Response("unexpected", { status: 500 });
    });

    await uploadFile(await generateVmk(), new File(["hello"], "hello.txt", { type: "text/plain" }), null);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    const fallback = calls.find((call) => call.url === "/api/files/upload");
    expect(fallback?.init?.method).toBe("PUT");
    expect((fallback?.init?.headers as Record<string, string>)["X-NekoBox-Storage-Key"]).toBe("user-1/object-1");
    expect(calls.at(-1)?.url).toBe("/api/files");
  });

  it("surfaces direct and fallback upload failures", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/files/upload-url") {
        return json({ storageKey: "user-1/object-1", uploadUrl: "https://storage.example/object-1" });
      }
      if (url === "https://storage.example/object-1") {
        return new Response("B2 rejected PUT", { status: 403, statusText: "Forbidden" });
      }
      if (url === "/api/files/upload") {
        return json({ error: "Could not upload encrypted blob to storage" }, { status: 502 });
      }
      return new Response("unexpected", { status: 500 });
    });

    await expect(
      uploadFile(await generateVmk(), new File(["hello"], "hello.txt", { type: "text/plain" }), null),
    ).rejects.toThrow(/Direct PUT failed \(403 Forbidden: B2 rejected PUT\); fallback failed \(502/);
  });
});

describe("downloadAndDecrypt", () => {
  it("falls back to same-origin encrypted download when direct storage GET fails", async () => {
    const masterKey = await generateVmk();
    const dek = await generateDek();
    const wrappedDek = await wrapDekWithMaster(masterKey, dek);
    const encrypted = await encryptFileChunked(dek, new TextEncoder().encode("hello").buffer);

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/files/file-1") {
        return json({
          url: "https://storage.example/object-1",
          mimeType: "text/plain",
          wrappedDek: wrappedDek.ciphertext,
          wrappedDekIv: wrappedDek.iv,
          contentIv: encrypted.contentIv,
          chunkSize: encrypted.chunkSize,
        });
      }
      if (url === "https://storage.example/object-1") {
        return new Response("B2 rejected GET", { status: 403, statusText: "Forbidden" });
      }
      if (url === "/api/files/file-1/blob") {
        return new Response(encrypted.blob, { status: 200 });
      }
      return new Response("unexpected", { status: 500 });
    });

    const { blob, mimeType } = await downloadAndDecrypt(masterKey, "file-1");

    expect(mimeType).toBe("text/plain");
    expect(await blob.text()).toBe("hello");
  });
});
