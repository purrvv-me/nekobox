"use client";

import { useState } from "react";
import { Modal, DialogFooter } from "./Modal";
import { DecryptedFile, shareFile } from "@/crypto/vaultOps";

interface Props {
  file: DecryptedFile;
  masterKey: CryptoKey;
  onClose: () => void;
  onShared: () => void;
}

export function ShareModal({ file, masterKey, onClose, onShared }: Props) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await shareFile(masterKey, file, email.trim().toLowerCase());
      setDone(true);
      onShared();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not share file");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} maxWidth={390}>
      {done ? (
        <div className="px-[22px] py-7 text-center">
          <div className="mx-auto mb-3.5 flex h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-black/[0.04] text-xl text-ink">
            ✓
          </div>
          <h2 className="m-0 mb-1.5 text-[17px] font-semibold text-ink">Shared securely</h2>
          <p className="m-0 mb-[18px] text-[12.5px] leading-[1.5] text-sub">
            A key was wrapped for <span className="font-mono text-ink">{email}</span>. Only they can
            decrypt it.
          </p>
          <button className="w-btn-accent px-6 py-2.5" onClick={onClose}>
            Done
          </button>
        </div>
      ) : (
        <>
          <div className="px-[22px] pb-1.5 pt-5">
            <h2 className="m-0 mb-1 text-[18px] font-semibold text-ink">Share securely</h2>
            <p className="m-0 mb-3.5 truncate font-mono text-[12px] text-sub">{file.name}</p>
            <label className="w-label">Recipient email</label>
            <input
              className="w-input mb-3"
              type="email"
              placeholder="friend@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
            <p className="m-0 text-[11.5px] leading-[1.5] text-[#8a8a8a]">
              A fresh key is wrapped for the recipient — the file stays encrypted end-to-end.
              Note: revoking later removes future access, but cannot recall a copy they already
              decrypted.
            </p>
            {error && <p className="mt-3 text-sm text-danger">{error}</p>}
          </div>
          <DialogFooter>
            <button
              className="w-btn-accent flex-1 py-2.5"
              disabled={busy || !email.trim()}
              onClick={submit}
            >
              {busy ? "Wrapping key…" : "Share"}
            </button>
            <button type="button" className="w-btn-ghost flex-1 py-2.5" onClick={onClose}>
              Cancel
            </button>
          </DialogFooter>
        </>
      )}
    </Modal>
  );
}
