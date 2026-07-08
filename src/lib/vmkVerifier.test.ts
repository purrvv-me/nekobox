import { describe, expect, it } from "vitest";
import {
  createVmkVerifier,
  deriveKEK,
  generateVmk,
  newSaltB64,
  wrapVmk,
} from "@/crypto/client";
import { unwrapSubmittedVmk, verifyVmkVerifier } from "./vmkVerifier";

describe("VMK verifier", () => {
  it("verifies a submitted wrapped VMK without learning plaintext data", async () => {
    const password = "correct horse battery staple";
    const kdfSalt = newSaltB64();
    const kdfIterations = 100_000;
    const vmk = await generateVmk();
    const kek = await deriveKEK(password, kdfSalt, kdfIterations);
    const wrappedVmk = await wrapVmk(kek, vmk);
    const verifier = await createVmkVerifier(vmk);

    const candidate = await unwrapSubmittedVmk({
      newPassword: password,
      kdfSalt,
      kdfIterations,
      wrappedVmk: wrappedVmk.ciphertext,
      wrappedVmkIv: wrappedVmk.iv,
    });

    await expect(
      unwrapSubmittedVmk({
        newPassword: "wrong password",
        kdfSalt,
        kdfIterations,
        wrappedVmk: wrappedVmk.ciphertext,
        wrappedVmkIv: wrappedVmk.iv,
      }),
    ).rejects.toThrow();

    expect(await verifyVmkVerifier(candidate, { ciphertext: verifier.ciphertext, iv: verifier.iv })).toBe(true);
    expect(await verifyVmkVerifier(await generateVmk(), { ciphertext: verifier.ciphertext, iv: verifier.iv })).toBe(false);
  });
});

