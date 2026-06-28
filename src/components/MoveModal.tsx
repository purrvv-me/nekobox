"use client";

import { useState } from "react";
import { Modal, DialogFooter } from "./Modal";
import { DecryptedFolder } from "@/crypto/vaultOps";

export function MoveModal({
  fileName,
  folders,
  currentFolderId,
  onClose,
  onMove,
}: {
  fileName: string;
  folders: DecryptedFolder[];
  currentFolderId: string | null;
  onClose: () => void;
  onMove: (folderId: string | null) => Promise<void>;
}) {
  const [pick, setPick] = useState<string | null>(currentFolderId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const destinations: { id: string | null; name: string }[] = [
    { id: null, name: "Vault root" },
    ...folders.map((f) => ({ id: f.id, name: f.name })),
  ];

  async function confirm() {
    if (pick === currentFolderId) return onClose();
    setBusy(true);
    setError(null);
    try {
      await onMove(pick);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not move file");
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} maxWidth={400}>
      <div className="px-[22px] pb-1 pt-5">
        <h2 className="m-0 mb-1 text-[18px] font-semibold text-ink">Move to…</h2>
        <p className="m-0 mb-3 text-[12px] text-sub">
          Choose a destination for <strong className="text-ink">{fileName}</strong>.
        </p>
        {error && <p className="mb-2 text-sm text-danger">{error}</p>}
      </div>

      <div className="w11-scroll max-h-[230px] overflow-y-auto px-3.5">
        {destinations.map((d) => {
          const active = d.id === pick;
          return (
            <button
              key={d.id ?? "root"}
              onClick={() => setPick(d.id)}
              className={`flex w-full items-center gap-2.5 rounded-md p-2 text-left transition-colors ${
                active ? "bg-black/[0.06]" : "hover:bg-black/[0.05]"
              }`}
            >
              <span className="text-[14px]">{d.id === null ? "🗂️" : "📁"}</span>
              <span className={`text-[12.5px] text-ink ${active ? "font-semibold" : ""}`}>
                {d.name}
              </span>
              {d.id === currentFolderId && (
                <span className="ml-auto font-mono text-[10px] text-sub2">current</span>
              )}
            </button>
          );
        })}
      </div>

      <DialogFooter>
        <button className="w-btn-accent flex-1 py-2.5" disabled={busy} onClick={confirm}>
          {busy ? "Moving…" : "Move here"}
        </button>
        <button type="button" className="w-btn-ghost flex-1 py-2.5" onClick={onClose}>
          Cancel
        </button>
      </DialogFooter>
    </Modal>
  );
}
