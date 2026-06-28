"use client";

// Windows 11-style "Encrypting locally…" dialog with a striped progress bar.
// Encryption is near-instant, so the bar animates indeterminately.
export function EncryptingModal() {
  return (
    <div
      className="fixed inset-0 z-[1100] flex animate-nb-overlay items-center justify-center p-5"
      style={{ background: "rgba(0,0,0,0.34)" }}
    >
      <div className="w-full max-w-[360px] animate-nb-dialog overflow-hidden rounded-[10px] border border-[#e6e9ef] bg-[#fbfbfb] px-[22px] py-6 text-center shadow-dialog">
        <div className="mb-3 text-[30px]">🔒</div>
        <h2 className="m-0 mb-1 text-[16px] font-semibold text-ink">Encrypting locally…</h2>
        <p className="m-0 mb-4 font-mono text-[11px] text-[#8a8a8a]">
          AES-256-GCM · never leaves this device
        </p>
        <div className="h-[6px] overflow-hidden rounded-full bg-[#e2e5eb]">
          <div
            className="h-full w-2/5 rounded-full bg-accent"
            style={{
              backgroundImage:
                "linear-gradient(45deg, rgba(255,255,255,0.35) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.35) 50%, rgba(255,255,255,0.35) 75%, transparent 75%)",
              backgroundSize: "28px 28px",
              animation: "nb-stripes 0.6s linear infinite",
            }}
          />
        </div>
      </div>
    </div>
  );
}
