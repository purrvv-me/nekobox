"use client";

import { useEffect } from "react";

// Windows 11 dialog shell: dimmed overlay + raised white window. Each dialog
// renders its own header / footer chrome inside.
export function Modal({
  onClose,
  maxWidth = 380,
  children,
}: {
  onClose: () => void;
  maxWidth?: number;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[1100] flex animate-nb-overlay items-center justify-center p-5"
      style={{ background: "rgba(0,0,0,0.34)" }}
      onClick={onClose}
    >
      <div
        className="w-full animate-nb-dialog overflow-hidden rounded-[10px] border border-[#e6e9ef] bg-[#fbfbfb] shadow-dialog"
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

// Gray footer action bar used by most dialogs.
export function DialogFooter({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-2.5 bg-[#f3f3f3] px-[22px] py-4">{children}</div>;
}
