import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Session, VaultItem } from "../lib/vault";
import { ContextMenu, MenuItem } from "./ContextMenu";
import { ShareDialog, SharesManager } from "./ShareUI";
import { BrandMark, FileGlyph } from "./icons";
import { FileKind, KIND_FOLDER, formatBytes, formatDate, kindOf } from "../lib/format";

type Folder = "all" | "recent" | FileKind;
type Menu = { x: number; y: number; item: VaultItem };

export function Explorer({ session, onLock }: { session: Session; onLock: () => void }) {
  const [items, setItems] = useState<VaultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [folder, setFolder] = useState<Folder>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<Menu | null>(null);
  const [renameItem, setRenameItem] = useState<VaultItem | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [preview, setPreview] = useState<{ item: VaultItem; url: string; kind: FileKind } | null>(null);
  const [shareItem, setShareItem] = useState<VaultItem | null>(null);
  const [showShares, setShowShares] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setItems(await session.list());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const it of items) c[kindOf(it.name)] = (c[kindOf(it.name)] ?? 0) + 1;
    return c;
  }, [items]);

  const shown = useMemo(() => {
    let list = items;
    if (folder === "recent") list = [...items].sort((a, b) => b.createdAt - a.createdAt).slice(0, 12);
    else if (folder !== "all") list = items.filter((it) => kindOf(it.name) === folder);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((it) => it.name.toLowerCase().includes(q));
    return list;
  }, [items, folder, search]);

  const upload = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      setBusy(true);
      setError(null);
      try {
        for (const f of files) await session.upload(f);
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setBusy(false);
      }
    },
    [session, refresh],
  );

  const open = useCallback(
    async (item: VaultItem) => {
      const k = kindOf(item.name);
      if (k === "image" || k === "audio") {
        setBusy(true);
        try {
          const blob = await session.getDecrypted(item, k === "image" ? "image/*" : "audio/*");
          setPreview({ item, url: URL.createObjectURL(blob), kind: k });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Preview failed");
        } finally {
          setBusy(false);
        }
      } else {
        session.download(item).catch((e) => setError(String(e)));
      }
    },
    [session],
  );

  const del = useCallback(
    async (targets: VaultItem[]) => {
      if (!targets.length) return;
      if (!confirm(`Delete ${targets.length === 1 ? `"${targets[0].name}"` : `${targets.length} files`}? This cannot be undone.`)) return;
      setBusy(true);
      try {
        await Promise.all(targets.map((t) => session.remove(t)));
        setSelected(new Set());
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Delete failed");
      } finally {
        setBusy(false);
      }
    },
    [session, refresh],
  );

  const fileMenu = (item: VaultItem): MenuItem[] => {
    const k = kindOf(item.name);
    return [
      { label: k === "image" || k === "audio" ? "Open / Preview" : "Open", icon: "📂", onClick: () => open(item) },
      { label: "Download", icon: "⬇", onClick: () => session.download(item) },
      { label: "Rename", icon: "✏️", onClick: () => { setRenameItem(item); setRenameValue(item.name); } },
      { label: "Share link…", icon: "🔗", onClick: () => setShareItem(item) },
      { divider: true, label: "" },
      { label: "Delete", icon: "🗑", danger: true, onClick: () => del([item]) },
    ];
  };

  const selectedItems = shown.filter((i) => selected.has(i.id));

  return (
    <div className="win">
      {/* tab strip */}
      <div className="tabstrip">
        <div className="tab"><span className="tab-mark"><BrandMark size={11} /></span> NekoBox Explorer</div>
        <div className="spacer" />
        <div className="wctl"><span className="wbtn">—</span><span className="wbtn">▢</span><button className="wbtn close" title="Lock & sign out" onClick={onLock}>✕</button></div>
      </div>

      {/* command bar */}
      <div className="cmdbar">
        <button className="btn accent sm" onClick={() => fileInput.current?.click()}>⬆ Upload</button>
        <span className="divider" />
        <button className="btn ghost sm" disabled={selectedItems.length !== 1} onClick={() => selectedItems[0] && open(selectedItems[0])}>👁 Preview</button>
        <button className="btn ghost sm" disabled={!selectedItems.length} onClick={() => selectedItems.forEach((i) => session.download(i))}>⬇ Download</button>
        <button className="btn ghost sm" disabled={selectedItems.length !== 1} onClick={() => { const it = selectedItems[0]; if (it) { setRenameItem(it); setRenameValue(it.name); } }}>✏️ Rename</button>
        <button className="btn danger sm" disabled={!selectedItems.length} onClick={() => del(selectedItems)}>🗑 Delete</button>
        <div className="spacer" />
        <div className="search">
          <span>🔍</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search (decrypted names)" />
          {search && <button onClick={() => setSearch("")}>✕</button>}
        </div>
      </div>

      <div className="body">
        {/* folder / nav pane */}
        <aside className="nav">
          <p className="nav-h">Quick access</p>
          <NavRow active={folder === "all"} icon="🗂" label="All files" count={items.length} onClick={() => setFolder("all")} />
          <NavRow active={folder === "recent"} icon="🕘" label="Recent" onClick={() => setFolder("recent")} />
          <NavRow active={false} icon="🔗" label="Shared links" onClick={() => setShowShares(true)} />
          <p className="nav-h" style={{ marginTop: 10 }}>Categories</p>
          {KIND_FOLDER.map((f) => (
            <NavRow key={f.key} active={folder === f.key} icon={f.icon} label={f.label} count={counts[f.key] ?? 0} onClick={() => setFolder(f.key)} />
          ))}
          <div className="grow" />
          <div className="storage">🔒 Encrypted on device · {items.length} files</div>
        </aside>

        {/* content grid */}
        <main
          className="content"
          onClick={() => setSelected(new Set())}
          onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }}
          onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
          onDrop={(e) => { e.preventDefault(); setDragging(false); upload(Array.from(e.dataTransfer.files)); }}
        >
          <div className="crumbs">
            <BrandMark size={13} /> <b>Vault</b>
            {folder !== "all" && <><span className="sep">›</span>{folder === "recent" ? "Recent" : KIND_FOLDER.find((f) => f.key === folder)?.label}</>}
            <span className="count">{shown.length} items</span>
          </div>

          {error && <p className="err inline">{error}</p>}

          {loading ? (
            <p className="muted pad">Decrypting your vault…</p>
          ) : shown.length === 0 ? (
            <div className="empty">
              <BrandMark size={44} />
              <p className="empty-t">{search ? "No matches" : "This folder is empty"}</p>
              <p className="muted">Drop files here or click Upload — encrypted before they leave your device.</p>
              {!search && <button className="btn accent" onClick={() => fileInput.current?.click()}>Upload file</button>}
            </div>
          ) : (
            <div className="grid">
              {shown.map((item) => (
                <div
                  key={item.id}
                  className={`tile${selected.has(item.id) ? " sel" : ""}`}
                  title={`${item.name} · ${formatBytes(item.size)} · ${formatDate(item.createdAt)}`}
                  onClick={(e) => { e.stopPropagation(); setSelected(e.ctrlKey || e.metaKey ? toggle(selected, item.id) : new Set([item.id])); }}
                  onDoubleClick={(e) => { e.stopPropagation(); open(item); }}
                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); if (!selected.has(item.id)) setSelected(new Set([item.id])); setMenu({ x: e.clientX, y: e.clientY, item }); }}
                >
                  <FileGlyph kind={kindOf(item.name)} size={46} />
                  <span className="tile-name">{item.name}</span>
                  <span className="tile-meta">{formatBytes(item.size)}</span>
                </div>
              ))}
            </div>
          )}

          {dragging && (
            <div className="dropzone"><div className="dz-lock">🔒</div><b>Drop to encrypt &amp; upload</b><span className="muted">end-to-end · zero-knowledge</span></div>
          )}
        </main>
      </div>

      <div className="statusbar">
        <span>{selected.size ? `${selected.size} selected` : `${shown.length} items`}</span>
        <span className="mono">🔓 Unlocked · AES-256-GCM · vault {session.vaultId.slice(0, 14)}…</span>
      </div>

      <input ref={fileInput} type="file" multiple hidden onChange={(e) => { upload(Array.from(e.target.files ?? [])); e.currentTarget.value = ""; }} />
      {busy && <div className="busy">🔒 Encrypting locally…</div>}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={fileMenu(menu.item)} onClose={() => setMenu(null)} />}

      {renameItem && (
        <Modal title="Rename" onClose={() => setRenameItem(null)}>
          <form onSubmit={async (e) => { e.preventDefault(); const it = renameItem; setRenameItem(null); if (it && renameValue.trim()) { await session.rename(it, renameValue.trim()); await refresh(); } }}>
            <input className="inp" value={renameValue} autoFocus onChange={(e) => setRenameValue(e.target.value)} onFocus={(e) => e.target.select()} />
            <div className="row end">
              <button type="button" className="btn ghost" onClick={() => setRenameItem(null)}>Cancel</button>
              <button className="btn accent">Rename</button>
            </div>
          </form>
        </Modal>
      )}

      {preview && (
        <Modal title={preview.item.name} onClose={() => { URL.revokeObjectURL(preview.url); setPreview(null); }}>
          <div className="preview">
            {preview.kind === "image" ? <img src={preview.url} alt={preview.item.name} /> : <audio src={preview.url} controls autoPlay />}
          </div>
          <p className="muted center mono">🔓 Decrypted locally — never sent to a server</p>
        </Modal>
      )}

      {shareItem && <ShareDialog session={session} item={shareItem} onClose={() => setShareItem(null)} />}
      {showShares && <SharesManager session={session} onClose={() => setShowShares(false)} />}
    </div>
  );
}

function NavRow({ active, icon, label, count, onClick }: { active: boolean; icon: string; label: string; count?: number; onClick: () => void }) {
  return (
    <button className={`nav-row${active ? " active" : ""}`} onClick={onClick}>
      <span className="nav-ico">{icon}</span>
      <span className="nav-lbl">{label}</span>
      {typeof count === "number" && <span className="nav-count">{count}</span>}
    </button>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-head"><span>{title}</span><button className="x" onClick={onClose}>✕</button></div>
        <div className="dialog-body">{children}</div>
      </div>
    </div>
  );
}

function toggle(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  next.has(id) ? next.delete(id) : next.add(id);
  return next;
}
