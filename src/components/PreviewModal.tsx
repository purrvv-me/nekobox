"use client";

import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { BrandMark } from "./icons";
import { extLabel, fileKind, formatBytes } from "@/lib/format";

interface Props {
  name: string;
  mimeType: string;
  size: number;
  load: () => Promise<{ blob: Blob; mimeType: string }>;
  onClose: () => void;
}

export function PreviewModal({ name, mimeType, size, load, onClose }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let active = true;
    (async () => {
      try {
        const { blob } = await load();
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Failed to decrypt");
      }
    })();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const kind = fileKind(mimeType);
  const meta = `${formatBytes(size)} · ${extLabel(name, mimeType)} · AES-256-GCM`;

  return (
    <Modal onClose={onClose} maxWidth={460}>
      {/* title bar */}
      <div className="flex h-10 items-center border-b border-line bg-field pl-3.5 pr-1.5">
        <span className="mr-2 text-sub"><BrandMark size={15} /></span>
        <span className="flex-1 truncate text-[12.5px] font-semibold text-ink">{name}</span>
        <button
          onClick={onClose}
          className="flex h-10 w-[46px] items-center justify-center text-[15px] text-ink transition-colors hover:bg-danger hover:text-white"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div className="p-3.5">
        <div
          className="flex h-[264px] flex-col items-center justify-center gap-2 overflow-hidden rounded-[8px] border border-line3"
          style={{
            backgroundColor: "#eef2f8",
            backgroundImage:
              "repeating-linear-gradient(135deg, rgba(0,0,0,0.04) 0 12px, transparent 12px 24px)",
          }}
        >
          {error ? (
            <span className="text-sm text-danger">{error}</span>
          ) : !url ? (
            <span className="font-mono text-[11px] text-[#8a8a8a]">decrypting…</span>
          ) : kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={name} className="max-h-full w-auto rounded-[6px]" />
          ) : kind === "audio" ? (
            <audio src={url} controls autoPlay className="w-[88%]" />
          ) : (
            <a href={url} download={name} className="w-btn-accent px-4 py-2">
              Download to view
            </a>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2.5 rounded-[7px] border border-black/10 bg-black/[0.04] px-3 py-2.5">
          <span className="text-[13px]">🔓</span>
          <span className="truncate font-mono text-[11px] text-ink">
            Decrypted locally — {meta}
          </span>
        </div>
      </div>
    </Modal>
  );
}
