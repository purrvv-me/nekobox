"use client";

import { useState } from "react";
import { Modal, DialogFooter } from "./Modal";
import { useSession } from "./SessionProvider";

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { user, changePassword } = useSession();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < 8) return setError("New password must be at least 8 characters.");
    if (next !== confirm) return setError("New passwords do not match.");
    setBusy(true);
    try {
      await changePassword(current, next);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} maxWidth={400}>
      <div className="px-[22px] pb-1.5 pt-5">
        <h2 className="m-0 text-[18px] font-semibold text-ink">Account</h2>
        <p className="m-0 mt-0.5 font-mono text-[11.5px] text-sub">{user?.email}</p>
      </div>

      {done ? (
        <>
          <div className="px-[22px] py-4">
            <p className="m-0 rounded-md border border-black/10 bg-black/[0.04] px-3 py-2.5 text-[12.5px] text-ink">
              ✓ Password changed. Your files stayed encrypted the whole time — only the password
              wrapping changed.
            </p>
          </div>
          <DialogFooter>
            <button className="w-btn-accent flex-1 py-2.5" onClick={onClose}>Done</button>
          </DialogFooter>
        </>
      ) : (
        <form onSubmit={submit}>
          <div className="px-[22px] pb-1.5 pt-2">
            <p className="mb-3 text-[12.5px] font-semibold text-ink">Change master password</p>
            <label className="w-label">Current password</label>
            <input className="w-input mb-3" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
            <label className="w-label">New password</label>
            <input className="w-input mb-3" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />
            <label className="w-label">Confirm new password</label>
            <input className="w-input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            {error && <p className="mt-3 text-sm text-danger">{error}</p>}
          </div>
          <DialogFooter>
            <button className="w-btn-accent flex-1 py-2.5" disabled={busy}>{busy ? "Saving…" : "Change password"}</button>
            <button type="button" className="w-btn-ghost flex-1 py-2.5" onClick={onClose}>Cancel</button>
          </DialogFooter>
        </form>
      )}
    </Modal>
  );
}
