"use client";

import Link from "next/link";
import { DecryptedFolder } from "@/crypto/vaultOps";
import { FolderIcon } from "./icons";
import { formatBytes } from "@/lib/format";

const QUOTA_BYTES = 15 * 1024 * 1024 * 1024;

export interface QuickItem {
  key: string;
  label: string;
  icon: string;
  count?: number;
  active: boolean;
  href?: string;
  onClick?: () => void;
}

interface Props {
  quick: QuickItem[];
  folders?: DecryptedFolder[];
  selectedFolderId?: string | null;
  onSelectFolder?: (id: string) => void;
  onFolderContext?: (e: React.MouseEvent, folder: DecryptedFolder) => void;
  usedBytes?: number;
}

function Row({
  active,
  onClick,
  href,
  onContextMenu,
  children,
}: {
  active: boolean;
  onClick?: () => void;
  href?: string;
  onContextMenu?: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  const cls = `group relative flex h-8 items-center gap-2.5 rounded-md px-2.5 transition-colors ${
    active ? "bg-black/[0.065] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.035)]" : "hover:bg-black/[0.045]"
  } focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#242424]`;
  const bar = (
    <span
      className="absolute left-0.5 top-2 bottom-2 w-[3px] rounded-sm"
      style={{ background: active ? "#1a1a1a" : "transparent" }}
    />
  );
  if (href) {
    return (
      <Link href={href} className={cls} onClick={onClick} onContextMenu={onContextMenu}>
        {bar}
        {children}
      </Link>
    );
  }
  return (
    <button className={cls + " w-full text-left"} onClick={onClick} onContextMenu={onContextMenu}>
      {bar}
      {children}
    </button>
  );
}

export function NavPane({
  quick,
  folders,
  selectedFolderId,
  onSelectFolder,
  onFolderContext,
  usedBytes = 0,
}: Props) {
  const pct = Math.min(100, Math.round((usedBytes / QUOTA_BYTES) * 100)) || 0;

  return (
    <div className="w11-scroll w-[238px] flex-shrink-0 overflow-y-auto border-r border-line bg-nav px-2 py-2.5">
      <p className="mx-2 mb-1.5 mt-1.5 text-[11px] font-semibold text-sub">Quick access</p>
      {quick.map((q) => (
        <Row key={q.key} active={q.active} href={q.href} onClick={q.onClick}>
          <span className="text-[15px] grayscale">{q.icon}</span>
          <span className={`flex-1 text-[12.5px] text-ink ${q.active ? "font-semibold" : ""}`}>
            {q.label}
          </span>
          {typeof q.count === "number" && (
            <span className="font-mono text-[10.5px] text-faint">{q.count}</span>
          )}
        </Row>
      ))}

      {folders && (
        <>
          <div className="mx-2 my-2.5 h-px bg-[#e6e9ef]" />
          <p className="mx-2 mb-1.5 mt-1 text-[11px] font-semibold text-sub">This vault</p>
          {folders.length === 0 ? (
            <p className="rounded-md px-2.5 py-1.5 text-[12px] text-faint">No folders yet</p>
          ) : (
            folders.map((f) => {
              const active = selectedFolderId === f.id;
              return (
                <Row
                  key={f.id}
                  active={active}
                  onClick={() => onSelectFolder?.(f.id)}
                  onContextMenu={(e) => onFolderContext?.(e, f)}
                >
                  <span className="ml-1.5 inline-flex">
                    <FolderIcon size={18} />
                  </span>
                  <span
                    className={`flex-1 truncate text-[12.5px] text-ink ${active ? "font-semibold" : ""}`}
                  >
                    {f.name}
                  </span>
                  <span className="font-mono text-[10px] text-faint">{f.fileCount}</span>
                </Row>
              );
            })
          )}
        </>
      )}

      <div className="mx-2 my-2.5 h-px bg-[#e6e9ef]" />
      <div className="mx-0.5 rounded-lg border border-line bg-white/70 px-2.5 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
        <div className="mb-[7px] flex items-center justify-between">
          <span className="text-[11px] font-medium text-sub">Encrypted storage</span>
          <span className="text-[10px]">🔒</span>
        </div>
        <div className="mb-1.5 h-[5px] overflow-hidden rounded-full bg-[#e2e5eb]">
          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(pct, 2)}%` }} />
        </div>
        <div className="flex items-center justify-between">
          <p className="m-0 font-mono text-[10px] text-sub2">{formatBytes(usedBytes)} of 15 GB</p>
          <p className="m-0 font-mono text-[10px] text-faint">{pct}%</p>
        </div>
      </div>
    </div>
  );
}
