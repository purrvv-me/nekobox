"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/components/AuthGate";
import { NavPane, QuickItem } from "@/components/NavPane";
import { ContextMenu, MenuItem } from "@/components/ContextMenu";
import { FileTypeIcon, BrandMark } from "@/components/icons";
import { PreviewModal } from "@/components/PreviewModal";
import { useSession } from "@/components/SessionProvider";
import { SharedItem, downloadShared, listShared, revokeShare } from "@/crypto/vaultOps";
import { fileKind, formatBytes } from "@/lib/format";
import { saveBlob } from "@/lib/download";

type Menu = { x: number; y: number; items: MenuItem[] };

function SharedInner() {
  const { keys, logout } = useSession();
  const privateKey = keys!.privateKey;
  const router = useRouter();

  const [items, setItems] = useState<SharedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<SharedItem | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setItems(await listShared(privateKey));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load shared files");
    } finally {
      setLoading(false);
    }
  }, [privateKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleDownload = useCallback(
    async (item: SharedItem) => {
      setBusyId(item.id);
      setError(null);
      try {
        const { blob } = await downloadShared(privateKey, item);
        saveBlob(blob, item.name);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Download failed");
      } finally {
        setBusyId(null);
      }
    },
    [privateKey],
  );

  const openItem = useCallback((item: SharedItem) => {
    const kind = fileKind(item.mimeType);
    if (kind === "image" || kind === "audio") setPreview(item);
    else handleDownload(item);
  }, [handleDownload]);

  const handleRevoke = useCallback(async (item: SharedItem) => {
    if (!confirm(`Remove "${item.name}" from your shared list?`)) return;
    setBusyId(item.id);
    try {
      await revokeShare(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove share");
    } finally {
      setBusyId(null);
    }
  }, []);

  const itemMenu = (item: SharedItem): MenuItem[] => {
    const kind = fileKind(item.mimeType);
    const previewable = kind === "image" || kind === "audio";
    return [
      { label: previewable ? "Open / Preview" : "Open", icon: previewable ? "👁" : "⬇", onClick: () => openItem(item) },
      { label: "Download", icon: "⬇", onClick: () => handleDownload(item) },
      { divider: true, label: "" },
      { label: "Remove", icon: "🗑", danger: true, onClick: () => handleRevoke(item) },
    ];
  };

  const openMenu = (e: React.MouseEvent, menuItems: MenuItem[]) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, items: menuItems });
  };

  const quick: QuickItem[] = [
    { key: "all", label: "All files", icon: "🗂️", active: false, href: "/vault" },
    { key: "shared", label: "Shared with me", icon: "👥", count: items.length, active: true },
  ];

  return (
    <div className="h-screen p-3.5">
      <div className="flex h-full flex-col overflow-hidden rounded-[10px] border border-[#dfe3ea] bg-win shadow-win">
        {/* TAB STRIP */}
        <div className="flex h-10 flex-shrink-0 items-end gap-0 bg-mica px-1.5">
          <div className="flex h-[33px] items-center gap-2 rounded-t-lg bg-win px-3" style={{ boxShadow: "0 -1px 0 #e3e7ee inset, 1px 0 0 #e3e7ee, -1px 0 0 #e3e7ee" }}>
            <span className="flex h-[18px] w-[18px] items-center justify-center rounded-[5px] text-white" style={{ background: "linear-gradient(160deg,#2a2a2a,#000)" }}><BrandMark size={11} /></span>
            <span className="text-[12.5px] font-semibold text-ink">Shared with me</span>
          </div>
          <div className="flex-1" />
          <div className="flex h-10 items-center text-sub">
            <span className="flex h-[30px] w-[46px] items-center justify-center"><span className="h-[1.5px] w-[11px] bg-current" /></span>
            <span className="flex h-[30px] w-[46px] items-center justify-center"><span className="h-[10px] w-[10px] rounded-[2px] border-[1.5px] border-current" /></span>
            <button onClick={async () => { await logout(); router.push("/login"); }} title="Lock & sign out" className="flex h-[30px] w-[46px] items-center justify-center text-[14px] transition-colors hover:bg-danger hover:text-white">✕</button>
          </div>
        </div>

        {/* ADDRESS BAR */}
        <div className="flex h-[42px] flex-shrink-0 items-center gap-2 border-b border-line bg-win px-3">
          <div className="flex h-[30px] min-w-0 flex-1 items-center gap-1 rounded-md border border-line3 bg-field px-3">
            <span className="mr-1 text-[13px]">👥</span>
            <span className="text-[12.5px] font-semibold text-ink">Shared with me</span>
          </div>
          <span className="font-mono text-[11px] text-sub2">re-encrypted for your key</span>
        </div>

        {/* BODY */}
        <div className="flex min-h-0 flex-1">
          <NavPane quick={quick} />

          <div
            className="w11-scroll relative min-w-0 flex-1 overflow-y-auto bg-win"
            onClick={() => setSelectedId(null)}
          >
            {error && (
              <p className="mx-[18px] mt-4 rounded-md border border-[#f0d6d2] bg-[#fdf4f3] px-3 py-2 text-sm text-danger">{error}</p>
            )}

            {loading ? (
              <p className="animate-pulse px-[18px] py-5 text-sm text-sub">Decrypting shared files…</p>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center px-5 py-16 text-center">
                <div className="mb-3.5 text-[40px] opacity-70">📨</div>
                <p className="m-0 mb-[7px] text-[15px] font-semibold text-ink">Nothing shared yet</p>
                <p className="m-0 max-w-[300px] text-[12.5px] leading-[1.55] text-[#7a7a7a]">Files others encrypt for you appear here, decryptable only with your private key.</p>
              </div>
            ) : (
              <div className="animate-nb-page px-[18px] pb-10 pt-4">
                <p className="m-0 mb-2.5 text-[11.5px] font-semibold text-[#7a7a7a]">Files</p>
                <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(124px, 1fr))" }}>
                  {items.map((item) => (
                    <div
                      key={item.id}
                      onClick={(e) => { e.stopPropagation(); setSelectedId(item.id); }}
                      onDoubleClick={(e) => { e.stopPropagation(); openItem(item); }}
                      onContextMenu={(e) => { setSelectedId(item.id); openMenu(e, itemMenu(item)); }}
                      style={{ background: selectedId === item.id ? "rgba(0,0,0,0.06)" : "transparent", borderColor: selectedId === item.id ? "rgba(0,0,0,0.12)" : "transparent" }}
                      className="flex select-none flex-col items-center gap-2 rounded-lg border px-2 pb-3 pt-3.5 transition-colors hover:-translate-y-px hover:bg-black/[0.04]"
                    >
                      <FileTypeIcon kind={fileKind(item.mimeType)} size={44} lock />
                      <span className="max-w-[108px] truncate text-center text-[12px] text-ink">{item.name}</span>
                      <span className="max-w-[108px] truncate text-center font-mono text-[9.5px] text-sub2" title={item.fromEmail}>{item.fromEmail}</span>
                      <span className="font-mono text-[9px] text-faint">{busyId === item.id ? "working…" : formatBytes(item.size)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* STATUS BAR */}
        <div className="flex h-[30px] flex-shrink-0 items-center justify-between border-t border-line bg-mica px-3.5">
          <span className="text-[11.5px] text-[#5a5a5a]">{items.length} {items.length === 1 ? "item" : "items"}</span>
          <div className="flex items-center gap-2">
            <span className="text-[11px]">🔓</span>
            <span className="font-mono text-[10.5px] text-sub">decrypted with your private key</span>
          </div>
        </div>
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
      {preview && (
        <PreviewModal name={preview.name} mimeType={preview.mimeType} size={preview.size} load={() => downloadShared(privateKey, preview)} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}

export default function SharedPage() {
  return (
    <AuthGate>
      <SharedInner />
    </AuthGate>
  );
}
