"use client";

import { useState } from "react";

// Shown ONCE right after registration. The recovery code is the only way to
// regain access if the password is forgotten — the server can't help.
export function RecoveryCodeModal({ code, onContinue }: { code: string; onContinue: () => void }) {
  const [ack, setAck] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be blocked; download still works */
    }
  };

  const download = () => {
    const blob = new Blob([`NekoBox recovery code\n\n${code}\n\nKeep this safe. It is the only way to recover your vault if you forget your password.\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nekobox-recovery-code.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="fixed inset-0 z-[1100] flex animate-nb-overlay items-center justify-center p-5" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="w-full max-w-[420px] animate-nb-dialog overflow-hidden rounded-[12px] border border-[#e6e9ef] bg-[#fbfbfb] shadow-dialog">
        <div className="px-6 pb-2 pt-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-[14px] text-2xl text-white" style={{ background: "linear-gradient(160deg,#2a2a2a,#000)" }}>🔑</div>
          <h2 className="m-0 mb-1.5 text-[18px] font-semibold text-ink">Save your recovery code</h2>
          <p className="m-0 text-[12.5px] leading-[1.5] text-sub">
            This is the <strong className="text-ink">only</strong> way to recover your vault if you
            forget your password. We can never see or reset it.
          </p>
        </div>

        <div className="px-6 py-4">
          <div className="select-all rounded-[8px] border border-line2 bg-white px-4 py-3.5 text-center font-mono text-[15px] font-semibold tracking-[1px] text-ink">
            {code}
          </div>
          <div className="mt-2.5 flex gap-2">
            <button onClick={copy} className="w-btn-ghost h-9 flex-1">{copied ? "Copied ✓" : "Copy"}</button>
            <button onClick={download} className="w-btn-ghost h-9 flex-1">Download .txt</button>
          </div>
        </div>

        <div className="border-t border-line bg-[#f3f3f3] px-6 py-4">
          <label className="mb-3 flex cursor-pointer select-none items-start gap-2.5">
            <input type="checkbox" className="mt-0.5 accent-[#1a1a1a]" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            <span className="text-[12px] leading-[1.45] text-ink-soft">I have saved my recovery code somewhere safe.</span>
          </label>
          <button onClick={onContinue} disabled={!ack} className="w-btn-accent h-10 w-full">
            Enter my vault
          </button>
        </div>
      </div>
    </div>
  );
}
