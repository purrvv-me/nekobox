"use client";

import { useState } from "react";
import { Modal, DialogFooter } from "./Modal";

export function RenameModal({
  title,
  initial,
  onClose,
  onSubmit,
}: {
  title: string;
  initial: string;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(n);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} maxWidth={380}>
      <form onSubmit={submit}>
        <div className="px-[22px] pb-1.5 pt-5">
          <h2 className="m-0 mb-4 text-[18px] font-semibold text-ink">{title}</h2>
          <input
            className="w-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            onFocus={(e) => e.target.select()}
          />
          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        </div>
        <DialogFooter>
          <button className="w-btn-accent flex-1 py-2.5" disabled={busy}>
            {busy ? "Saving…" : "Rename"}
          </button>
          <button type="button" className="w-btn-ghost flex-1 py-2.5" onClick={onClose}>
            Cancel
          </button>
        </DialogFooter>
      </form>
    </Modal>
  );
}
