import { describe, it, expect } from "vitest";
import {
  generateAesKey,
  generateWrappedRsaKeypair,
  importRsaPublicKey,
  importWrappedRsaPrivateKey,
  rsaUnwrapAesKey,
  rsaWrapAesKey,
  seal,
  open,
  utf8,
  fromUtf8,
} from "./index";

describe("RSA sharing (Stage-1)", () => {
  it("wraps a DEK to a recipient; only their private key unwraps it", async () => {
    const aliceMaster = await generateAesKey();
    const bobMaster = await generateAesKey();
    const bob = await generateWrappedRsaKeypair(bobMaster);

    // Alice encrypts a file with a DEK, then wraps the DEK for Bob.
    const dek = await generateAesKey();
    const sealed = await seal(dek, utf8("shared secret file"));
    const bobPub = await importRsaPublicKey(bob.publicKey);
    const wrappedDek = await rsaWrapAesKey(bobPub, dek);

    // Bob restores his private key (from his master key) and unwraps the DEK.
    const bobPriv = await importWrappedRsaPrivateKey(bobMaster, bob.encPrivateKey);
    const dekForBob = await rsaUnwrapAesKey(bobPriv, wrappedDek);
    expect(fromUtf8(await open(dekForBob, sealed))).toBe("shared secret file");

    // A different user's private key cannot unwrap it.
    const eve = await generateWrappedRsaKeypair(aliceMaster);
    const evePriv = await importWrappedRsaPrivateKey(aliceMaster, eve.encPrivateKey);
    await expect(rsaUnwrapAesKey(evePriv, wrappedDek)).rejects.toBeTruthy();
  });

  it("private key is unrecoverable without the right master key", async () => {
    const master = await generateAesKey();
    const other = await generateAesKey();
    const kp = await generateWrappedRsaKeypair(master);
    await expect(importWrappedRsaPrivateKey(other, kp.encPrivateKey)).rejects.toBeTruthy();
  });
});
