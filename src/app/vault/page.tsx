"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/components/AuthGate";
import { NavPane, QuickItem } from "@/components/NavPane";
import { ContextMenu, MenuItem } from "@/components/ContextMenu";
import { FolderIcon, FileTypeIcon, BrandMark } from "@/components/icons";
import { PreviewModal } from "@/components/PreviewModal";
import { EncryptingModal } from "@/components/EncryptingModal";
import { NewFolderModal } from "@/components/NewFolderModal";
import { RenameModal } from "@/components/RenameModal";
import { MoveModal } from "@/components/MoveModal";
import { SettingsModal } from "@/components/SettingsModal";
import { useSession } from "@/components/SessionProvider";
import {
  DecryptedFile,
  DecryptedFolder,
  createFolder,
  deleteFile,
  deleteFolder,
  downloadAndDecrypt,
  listFolders,
  listVault,
  moveFile,
  renameFile,
  renameFolder,
  uploadFile,
} from "@/crypto/vaultOps";
import { extLabel, fileKind, formatBytes, formatDate } from "@/lib/format";
import { saveBlob } from "@/lib/download";

type Menu = { x: number; y: number; items: MenuItem[] };
type RenameTarget = { kind: "file" | "folder"; id: string; name: string };
type View = "grid" | "details";
type SortKey = "name" | "type" | "size" | "added";
type Sort = { key: SortKey; dir: "asc" | "desc" };

const DND_MIME = "application/x-nekobox-items";

function VaultInner() {
  const { keys, logout } = useSession();
  const masterKey = keys!.masterKey;
  const router = useRouter();

  const [files, setFiles] = useState<DecryptedFile[]>([]);
  const [folders, setFolders] = useState<DecryptedFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastClicked, setLastClicked] = useState<string | null>(null);
  const [view, setView] = useState<View>("grid");
  const [sort, setSort] = useState<Sort>({ key: "name", dir: "asc" });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dropFolderId, setDropFolderId] = useState<string | null>(null);

  const [menu, setMenu] = useState<Menu | null>(null);
  const [previewTarget, setPreviewTarget] = useState<DecryptedFile | null>(null);
  const [moveTarget, setMoveTarget] = useState<DecryptedFile | null>(null);
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const usedBytes = useMemo(() => files.reduce((a, f) => a + f.size, 0), [files]);
  const currentFolder = folders.find((f) => f.id === selectedFolderId) ?? null;
  const atRoot = selectedFolderId === null;
  const q = search.trim().toLowerCase();

  const isFolderId = useCallback((id: string) => folders.some((f) => f.id === id), [folders]);

  const sortedFolders = useMemo(() => {
    let list = atRoot ? folders : [];
    if (q) list = list.filter((f) => f.name.toLowerCase().includes(q));
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      let v = 0;
      if (sort.key === "size") v = a.fileCount - b.fileCount;
      else if (sort.key === "added") v = +new Date(a.createdAt) - +new Date(b.createdAt);
      else v = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      return v * dir;
    });
  }, [folders, atRoot, q, sort]);

  const sortedFiles = useMemo(() => {
    let list = files.filter((f) => (f.folderId ?? null) === selectedFolderId);
    if (q) list = list.filter((f) => f.name.toLowerCase().includes(q));
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      let v = 0;
      if (sort.key === "size") v = a.size - b.size;
      else if (sort.key === "added") v = +new Date(a.createdAt) - +new Date(b.createdAt);
      else if (sort.key === "type")
        v = extLabel(a.name, a.mimeType).localeCompare(extLabel(b.name, b.mimeType));
      else v = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      return v * dir;
    });
  }, [files, selectedFolderId, q, sort]);

  const recentFiles = useMemo(
    () => (atRoot && !q ? [...files].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 6) : []),
    [files, atRoot, q],
  );

  const orderedIds = useMemo(
    () => [...sortedFolders.map((f) => f.id), ...sortedFiles.map((f) => f.id)],
    [sortedFolders, sortedFiles],
  );

  const selFiles = useMemo(
    () => sortedFiles.filter((f) => selectedIds.has(f.id)),
    [sortedFiles, selectedIds],
  );
  const selectionSize = selectedIds.size;

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [f, fo] = await Promise.all([listVault(masterKey), listFolders(masterKey)]);
      setFiles(f);
      setFolders(fo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load vault");
    } finally {
      setLoading(false);
    }
  }, [masterKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Clear selection when changing folders.
  useEffect(() => {
    setSelectedIds(new Set());
    setLastClicked(null);
  }, [selectedFolderId]);

  const handleUpload = useCallback(
    async (incoming: File[]) => {
      if (!incoming.length) return;
      setUploading(true);
      setError(null);
      try {
        for (const f of incoming) await uploadFile(masterKey, f, selectedFolderId);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [masterKey, refresh, selectedFolderId],
  );

  const handleDownload = useCallback(
    async (file: DecryptedFile) => {
      setError(null);
      try {
        const { blob } = await downloadAndDecrypt(masterKey, file.id);
        saveBlob(blob, file.name);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Download failed");
      }
    },
    [masterKey],
  );

  const openFile = useCallback(
    (file: DecryptedFile) => {
      const kind = fileKind(file.mimeType);
      if (kind === "image" || kind === "audio") setPreviewTarget(file);
      else handleDownload(file);
    },
    [handleDownload],
  );

  const openById = useCallback(
    (id: string) => {
      if (isFolderId(id)) {
        setSelectedFolderId(id);
      } else {
        const f = files.find((x) => x.id === id);
        if (f) openFile(f);
      }
    },
    [files, isFolderId, openFile],
  );

  // ── Deletion ───────────────────────────────────────────────────────
  const bulkDelete = useCallback(
    async (ids: string[]) => {
      if (!ids.length) return;
      const fileIds = ids.filter((id) => !isFolderId(id));
      const folderIds = ids.filter((id) => isFolderId(id));
      const label =
        ids.length === 1
          ? `"${folders.find((f) => f.id === ids[0])?.name ?? files.find((f) => f.id === ids[0])?.name ?? "item"}"`
          : `${ids.length} items`;
      const extra = folderIds.length ? " Folder contents move back to the root." : "";
      if (!confirm(`Delete ${label}? This cannot be undone.${extra}`)) return;
      try {
        await Promise.all(fileIds.map((id) => deleteFile(id)));
        await Promise.all(folderIds.map((id) => deleteFolder(id)));
        if (folderIds.includes(selectedFolderId ?? "")) setSelectedFolderId(null);
        setSelectedIds(new Set());
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Delete failed");
      }
    },
    [files, folders, isFolderId, refresh, selectedFolderId],
  );

  const renameById = useCallback(
    (id: string) => {
      if (isFolderId(id)) {
        const f = folders.find((x) => x.id === id);
        if (f) setRenameTarget({ kind: "folder", id, name: f.name });
      } else {
        const f = files.find((x) => x.id === id);
        if (f) setRenameTarget({ kind: "file", id, name: f.name });
      }
    },
    [files, folders, isFolderId],
  );

  // ── Selection ──────────────────────────────────────────────────────
  const selectClick = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      if (e.shiftKey && lastClicked) {
        const a = orderedIds.indexOf(lastClicked);
        const b = orderedIds.indexOf(id);
        if (a !== -1 && b !== -1) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          setSelectedIds(new Set(orderedIds.slice(lo, hi + 1)));
          return;
        }
      }
      if (e.ctrlKey || e.metaKey) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.has(id) ? next.delete(id) : next.add(id);
          return next;
        });
      } else {
        setSelectedIds(new Set([id]));
      }
      setLastClicked(id);
    },
    [lastClicked, orderedIds],
  );

  const anyDialogOpen =
    showNewFolder || showSettings || !!renameTarget || !!moveTarget || !!previewTarget;

  // ── Keyboard shortcuts ─────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (anyDialogOpen) return;
      if (e.key === "Escape") {
        if (menu) setMenu(null);
        else setSelectedIds(new Set());
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelectedIds(new Set(orderedIds));
        return;
      }
      if (selectedIds.size === 0) return;
      if (e.key === "F2" && selectedIds.size === 1) {
        e.preventDefault();
        renameById([...selectedIds][0]);
      } else if (e.key === "Delete") {
        e.preventDefault();
        bulkDelete([...selectedIds]);
      } else if (e.key === "Enter" && selectedIds.size === 1) {
        e.preventDefault();
        openById([...selectedIds][0]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anyDialogOpen, menu, selectedIds, orderedIds, renameById, bulkDelete, openById]);

  // ── Drag & drop: move into folders ─────────────────────────────────
  const onFileDragStart = useCallback(
    (e: React.DragEvent, id: string) => {
      const ids = selectedIds.has(id) ? [...selectedIds].filter((x) => !isFolderId(x)) : [id];
      if (!selectedIds.has(id)) setSelectedIds(new Set([id]));
      e.dataTransfer.setData(DND_MIME, JSON.stringify(ids));
      e.dataTransfer.effectAllowed = "move";
    },
    [selectedIds, isFolderId],
  );

  const onFolderDrop = useCallback(
    async (e: React.DragEvent, folderId: string) => {
      const raw = e.dataTransfer.getData(DND_MIME);
      setDropFolderId(null);
      if (!raw) return;
      e.preventDefault();
      e.stopPropagation();
      try {
        const ids: string[] = JSON.parse(raw);
        await Promise.all(ids.filter((id) => !isFolderId(id)).map((id) => moveFile(id, folderId)));
        setSelectedIds(new Set());
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not move");
      }
    },
    [isFolderId, refresh],
  );

  // ── Context menus ──────────────────────────────────────────────────
  const openMenu = (e: React.MouseEvent, items: MenuItem[]) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  const fileMenu = (file: DecryptedFile): MenuItem[] => {
    const kind = fileKind(file.mimeType);
    const previewable = kind === "image" || kind === "audio";
    const multi = selectedIds.size > 1 && selectedIds.has(file.id);
    if (multi) {
      return [
        { label: `Download ${selFiles.length} files`, icon: "⬇", onClick: () => selFiles.forEach(handleDownload) },
        { divider: true, label: "" },
        { label: `Delete ${selectedIds.size} items`, icon: "🗑", hint: "Del", danger: true, onClick: () => bulkDelete([...selectedIds]) },
      ];
    }
    return [
      { label: previewable ? "Open / Preview" : "Open", icon: previewable ? "👁" : "⬇", onClick: () => openFile(file) },
      { label: "Download", icon: "⬇", onClick: () => handleDownload(file) },
      { divider: true, label: "" },
      { label: "Rename", icon: "✏️", hint: "F2", onClick: () => setRenameTarget({ kind: "file", id: file.id, name: file.name }) },
      { label: "Move to…", icon: "📂", onClick: () => setMoveTarget(file) },
      { divider: true, label: "" },
      { label: "Delete", icon: "🗑", hint: "Del", danger: true, onClick: () => bulkDelete([file.id]) },
    ];
  };

  const folderMenu = (folder: DecryptedFolder): MenuItem[] => [
    { label: "Open", icon: "📂", onClick: () => setSelectedFolderId(folder.id) },
    { divider: true, label: "" },
    { label: "Rename", icon: "✏️", hint: "F2", onClick: () => setRenameTarget({ kind: "folder", id: folder.id, name: folder.name }) },
    { label: "Delete", icon: "🗑", hint: "Del", danger: true, onClick: () => bulkDelete([folder.id]) },
  ];

  const bgMenu = (): MenuItem[] => [
    { label: "Upload file", icon: "⬆", onClick: () => inputRef.current?.click() },
    { label: "New folder", icon: "📁", onClick: () => setShowNewFolder(true), disabled: !atRoot },
    { divider: true, label: "" },
    { label: "Select all", icon: "▣", hint: "Ctrl+A", disabled: orderedIds.length === 0, onClick: () => setSelectedIds(new Set(orderedIds)) },
    { label: "Refresh", icon: "🔄", onClick: () => refresh() },
  ];

  const itemCount = sortedFolders.length + sortedFiles.length;
  const statusLeft =
    selectionSize > 0
      ? `${selectionSize} of ${itemCount} selected`
      : `${itemCount} ${itemCount === 1 ? "item" : "items"}`;
  const noFileSel = selFiles.length === 0;
  const onePreviewable =
    selFiles.length === 1 && ["image", "audio"].includes(fileKind(selFiles[0].mimeType));
  const isEmpty = !loading && itemCount === 0;

  const quick: QuickItem[] = [
    { key: "all", label: "All files", icon: "🗂️", count: files.length, active: atRoot, onClick: () => setSelectedFolderId(null) },
  ];

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  return (
    <div className="h-screen p-3.5">
      <div className="flex h-full flex-col overflow-hidden rounded-[10px] border border-[#dfe3ea] bg-win shadow-win">
        {/* TAB STRIP */}
        <div className="flex h-10 flex-shrink-0 items-end gap-0 bg-mica px-1.5">
          <div className="flex h-[33px] items-center gap-2 rounded-t-lg bg-win px-3" style={{ boxShadow: "0 -1px 0 #e3e7ee inset, 1px 0 0 #e3e7ee, -1px 0 0 #e3e7ee" }}>
            <span className="flex h-[18px] w-[18px] items-center justify-center rounded-[5px] text-white" style={{ background: "linear-gradient(160deg,#2a2a2a,#000)" }}><BrandMark size={14} /></span>
            <span className="text-[12.5px] font-semibold text-ink">NekoBox Vault</span>
          </div>
          <div className="flex-1" />
          <button onClick={() => setShowSettings(true)} title="Account & settings" className="mb-1 mr-1 flex h-7 w-7 items-center justify-center rounded-md text-[14px] text-sub hover:bg-black/[0.06]">⚙</button>
          <div className="flex h-10 items-center text-sub">
            <span className="flex h-[30px] w-[46px] items-center justify-center"><span className="h-[1.5px] w-[11px] bg-current" /></span>
            <span className="flex h-[30px] w-[46px] items-center justify-center"><span className="h-[10px] w-[10px] rounded-[2px] border-[1.5px] border-current" /></span>
            <button onClick={async () => { await logout(); router.push("/login"); }} title="Lock & sign out" className="flex h-[30px] w-[46px] items-center justify-center text-[14px] transition-colors hover:bg-danger hover:text-white">✕</button>
          </div>
        </div>

        {/* COMMAND BAR */}
        <div className="flex h-12 flex-shrink-0 items-center gap-1.5 border-b border-line bg-win px-3">
          <button onClick={() => inputRef.current?.click()} className="w-btn-accent h-8 px-3.5"><span className="text-[14px]">⬆</span> Upload</button>
          <button onClick={() => setShowNewFolder(true)} disabled={!atRoot} className="w-btn-ghost h-8 px-3"><span className="text-[15px] leading-none">+</span> New folder</button>
          <div className="mx-1.5 h-[22px] w-px bg-line2" />
          <CmdBtn label="Preview" icon="👁" disabled={!onePreviewable} onClick={() => onePreviewable && openFile(selFiles[0])} />
          <CmdBtn label="Download" icon="⬇" disabled={noFileSel} onClick={() => selFiles.forEach(handleDownload)} />
          <CmdBtn label="Delete" icon="🗑" danger disabled={selectionSize === 0} onClick={() => bulkDelete([...selectedIds])} />
          <div className="flex-1" />
          <div className="flex h-8 overflow-hidden rounded-md border border-line2">
            <button onClick={() => setView("grid")} title="Icons" className={`w-[34px] text-[14px] ${view === "grid" ? "bg-black/[0.06]" : "bg-white"}`}>▦</button>
            <button onClick={() => setView("details")} title="Details" className={`w-[34px] border-l border-line2 text-[14px] ${view === "details" ? "bg-black/[0.06]" : "bg-white"}`}>≣</button>
          </div>
        </div>

        {/* ADDRESS BAR */}
        <div className="flex h-[42px] flex-shrink-0 items-center gap-2 border-b border-line bg-win px-3">
          <button onClick={() => setSelectedFolderId(null)} disabled={atRoot} title="Back" className="flex h-7 w-[30px] items-center justify-center rounded-md text-[15px] enabled:hover:bg-black/5 disabled:text-[#c4c8d0]">←</button>
          <button onClick={() => setSelectedFolderId(null)} disabled={atRoot} title="Up" className="flex h-7 w-[30px] items-center justify-center rounded-md text-[15px] enabled:hover:bg-black/5 disabled:text-[#c4c8d0]">↑</button>
          <div className="flex h-[30px] min-w-0 flex-1 items-center gap-1 rounded-md border border-line3 bg-field px-3">
            <span className="mr-1 text-sub"><BrandMark size={16} /></span>
            <button onClick={() => setSelectedFolderId(null)} className={`text-[12.5px] ${atRoot ? "font-semibold text-ink" : "text-sub hover:underline"}`}>Vault</button>
            {currentFolder && (<><span className="text-[12px] text-sub2">›</span><span className="truncate text-[12.5px] font-semibold text-ink">{currentFolder.name}</span></>)}
          </div>
          <div className="flex h-[30px] w-[200px] items-center gap-2 rounded-md border border-line3 bg-field px-3 focus-within:border-[#9aa3ad]">
            <span className="text-[13px] opacity-55">🔍</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search vault" className="w-full bg-transparent text-[12px] text-ink outline-none placeholder:text-sub2" />
            {search && <button onClick={() => setSearch("")} className="text-[12px] text-sub2 hover:text-ink">✕</button>}
          </div>
        </div>

        {/* BODY */}
        <div className="flex min-h-0 flex-1">
          <NavPane
            quick={quick}
            folders={folders}
            selectedFolderId={selectedFolderId}
            onSelectFolder={(id) => setSelectedFolderId(id)}
            onFolderContext={(e, f) => { setSelectedIds(new Set([f.id])); openMenu(e, folderMenu(f)); }}
            usedBytes={usedBytes}
          />

          <div
            className="w11-scroll relative min-w-0 flex-1 overflow-y-auto bg-win"
            onClick={() => setSelectedIds(new Set())}
            onContextMenu={(e) => openMenu(e, bgMenu())}
            onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }}
            onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
            onDrop={(e) => { if (e.dataTransfer.types.includes(DND_MIME)) return; e.preventDefault(); setDragging(false); handleUpload(Array.from(e.dataTransfer.files)); }}
          >
            {error && <p className="mx-[18px] mt-4 rounded-md border border-[#f0d6d2] bg-[#fdf4f3] px-3 py-2 text-sm text-danger">{error}</p>}

            {loading ? (
              <p className="animate-pulse px-[18px] py-5 text-sm text-sub">Decrypting your vault…</p>
            ) : isEmpty ? (
              q ? (
                <div className="px-[18px] py-16 text-center text-sm text-sub">No matches for “{search}”.</div>
              ) : (
                <EmptyState onUpload={() => inputRef.current?.click()} onNewFolder={atRoot ? () => setShowNewFolder(true) : undefined} inFolder={!atRoot} />
              )
            ) : view === "grid" ? (
              <div key={selectedFolderId ?? "root"} className="animate-nb-page px-[18px] pb-10 pt-4">
                {recentFiles.length > 0 && (
                  <>
                    <p className="m-0 mb-2.5 text-[11.5px] font-semibold text-[#7a7a7a]">Recent</p>
                    <div className="mb-6 grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(124px, 1fr))" }}>
                      {recentFiles.map((f) => (
                        <FileGridTile key={"r-" + f.id} file={f} selected={false} onClick={(e) => selectClick(e, f.id)} onOpen={() => openFile(f)} onContext={(e) => { setSelectedIds(new Set([f.id])); openMenu(e, fileMenu(f)); }} onDragStart={(e) => onFileDragStart(e, f.id)} />
                      ))}
                    </div>
                  </>
                )}
                {sortedFolders.length > 0 && (
                  <>
                    <p className="m-0 mb-2.5 text-[11.5px] font-semibold text-[#7a7a7a]">Folders</p>
                    <div className="mb-6 grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
                      {sortedFolders.map((f) => (
                        <FolderGridTile
                          key={f.id}
                          folder={f}
                          selected={selectedIds.has(f.id)}
                          dropActive={dropFolderId === f.id}
                          onClick={(e) => selectClick(e, f.id)}
                          onOpen={() => setSelectedFolderId(f.id)}
                          onContext={(e) => { if (!selectedIds.has(f.id)) setSelectedIds(new Set([f.id])); openMenu(e, folderMenu(f)); }}
                          onDragOver={(e) => { if (e.dataTransfer.types.includes(DND_MIME)) { e.preventDefault(); setDropFolderId(f.id); } }}
                          onDragLeave={() => setDropFolderId((c) => (c === f.id ? null : c))}
                          onDrop={(e) => onFolderDrop(e, f.id)}
                        />
                      ))}
                    </div>
                  </>
                )}
                {sortedFiles.length > 0 && (
                  <>
                    <p className="m-0 mb-2.5 text-[11.5px] font-semibold text-[#7a7a7a]">Files</p>
                    <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(124px, 1fr))" }}>
                      {sortedFiles.map((f) => (
                        <FileGridTile key={f.id} file={f} selected={selectedIds.has(f.id)} onClick={(e) => selectClick(e, f.id)} onOpen={() => openFile(f)} onContext={(e) => { if (!selectedIds.has(f.id)) setSelectedIds(new Set([f.id])); openMenu(e, fileMenu(f)); }} onDragStart={(e) => onFileDragStart(e, f.id)} />
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <DetailsView
                key={selectedFolderId ?? "root"}
                folders={sortedFolders}
                files={sortedFiles}
                selectedIds={selectedIds}
                sort={sort}
                dropFolderId={dropFolderId}
                onSort={toggleSort}
                onClickItem={selectClick}
                onOpenFolder={(id) => setSelectedFolderId(id)}
                onOpenFile={openFile}
                onFolderContext={(e, f) => { if (!selectedIds.has(f.id)) setSelectedIds(new Set([f.id])); openMenu(e, folderMenu(f)); }}
                onFileContext={(e, f) => { if (!selectedIds.has(f.id)) setSelectedIds(new Set([f.id])); openMenu(e, fileMenu(f)); }}
                onFileDragStart={onFileDragStart}
                onFolderDragOver={(e, id) => { if (e.dataTransfer.types.includes(DND_MIME)) { e.preventDefault(); setDropFolderId(id); } }}
                onFolderDragLeave={(id) => setDropFolderId((c) => (c === id ? null : c))}
                onFolderDrop={onFolderDrop}
              />
            )}

            {dragging && (
              <div className="pointer-events-none absolute inset-0 z-10 m-3 flex flex-col items-center justify-center gap-2 rounded-[10px] border-2 border-dashed border-accent/40 bg-black/[0.03] backdrop-blur-sm">
                <div className="text-3xl">🔒</div>
                <p className="text-[15px] font-semibold text-ink">Drop to encrypt &amp; upload</p>
                <p className="font-mono text-[11px] text-sub">{currentFolder ? `into "${currentFolder.name}"` : "into Vault root"}</p>
              </div>
            )}
          </div>
        </div>

        {/* STATUS BAR */}
        <div className="flex h-[30px] flex-shrink-0 items-center justify-between border-t border-line bg-mica px-3.5">
          <span className="truncate text-[11.5px] text-[#5a5a5a]">{statusLeft}</span>
          <div className="flex flex-shrink-0 items-center gap-2">
            <span className="text-[11px]">🔓</span>
            <span className="font-mono text-[10.5px] text-sub">Unlocked · AES-256-GCM · encrypted locally</span>
          </div>
        </div>
      </div>

      <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => { handleUpload(Array.from(e.target.files ?? [])); e.target.value = ""; }} />

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
      {uploading && <EncryptingModal />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showNewFolder && <NewFolderModal onClose={() => setShowNewFolder(false)} onCreate={async (name) => { await createFolder(masterKey, name); await refresh(); }} />}
      {renameTarget && (
        <RenameModal title={renameTarget.kind === "folder" ? "Rename folder" : "Rename file"} initial={renameTarget.name} onClose={() => setRenameTarget(null)} onSubmit={async (name) => { if (renameTarget.kind === "folder") await renameFolder(masterKey, renameTarget.id, name); else await renameFile(masterKey, renameTarget.id, name); await refresh(); }} />
      )}
      {moveTarget && <MoveModal fileName={moveTarget.name} folders={folders} currentFolderId={moveTarget.folderId ?? null} onClose={() => setMoveTarget(null)} onMove={async (folderId) => { await moveFile(moveTarget.id, folderId); await refresh(); }} />}
      {previewTarget && <PreviewModal name={previewTarget.name} mimeType={previewTarget.mimeType} size={previewTarget.size} load={() => downloadAndDecrypt(masterKey, previewTarget.id)} onClose={() => setPreviewTarget(null)} />}
    </div>
  );
}

// ── Local presentational helpers ──────────────────────────────────────
function CmdBtn({ label, icon, disabled, danger, onClick }: { label: string; icon: string; disabled?: boolean; danger?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={disabled} className={`flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[13px] transition-colors disabled:cursor-not-allowed ${disabled ? "border-[#eceef2] bg-nav text-[#b8bcc4]" : danger ? "border-line2 bg-white text-danger hover:bg-[#fdf4f3]" : "border-line2 bg-white text-ink hover:bg-[#f0f2f6]"}`}>
      <span>{icon}</span> {label}
    </button>
  );
}

function tileStyle(selected: boolean, dropActive?: boolean) {
  return {
    background: dropActive ? "rgba(0,0,0,0.1)" : selected ? "rgba(0,0,0,0.06)" : "transparent",
    borderColor: dropActive ? "#1a1a1a" : selected ? "rgba(0,0,0,0.12)" : "transparent",
  };
}

function FolderGridTile({ folder, selected, dropActive, onClick, onOpen, onContext, onDragOver, onDragLeave, onDrop }: { folder: DecryptedFolder; selected: boolean; dropActive: boolean; onClick: (e: React.MouseEvent) => void; onOpen: () => void; onContext: (e: React.MouseEvent) => void; onDragOver: (e: React.DragEvent) => void; onDragLeave: () => void; onDrop: (e: React.DragEvent) => void }) {
  return (
    <div onClick={onClick} onDoubleClick={(e) => { e.stopPropagation(); onOpen(); }} onContextMenu={onContext} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} style={tileStyle(selected, dropActive)} className="flex select-none items-center gap-3 rounded-lg border p-2.5 transition-colors hover:bg-black/[0.04]">
      <FolderIcon size={38} lock />
      <div className="min-w-0">
        <p className="m-0 mb-0.5 truncate text-[13px] font-medium text-ink">{folder.name}</p>
        <p className="m-0 font-mono text-[10.5px] text-sub2">{folder.fileCount} {folder.fileCount === 1 ? "file" : "files"}</p>
      </div>
    </div>
  );
}

function FileGridTile({ file, selected, onClick, onOpen, onContext, onDragStart }: { file: DecryptedFile; selected: boolean; onClick: (e: React.MouseEvent) => void; onOpen: () => void; onContext: (e: React.MouseEvent) => void; onDragStart: (e: React.DragEvent) => void }) {
  return (
    <div draggable onDragStart={onDragStart} onClick={onClick} onDoubleClick={(e) => { e.stopPropagation(); onOpen(); }} onContextMenu={onContext} style={tileStyle(selected)} className="flex select-none flex-col items-center gap-2.5 rounded-lg border px-2 pb-3 pt-3.5 transition-colors hover:-translate-y-px hover:bg-black/[0.04]">
      <FileTypeIcon kind={fileKind(file.mimeType)} size={44} lock />
      <span className="max-w-[108px] truncate text-center text-[12px] text-ink">{file.name}</span>
    </div>
  );
}

function SortHead({ label, k, sort, onSort }: { label: string; k: SortKey; sort: Sort; onSort: (k: SortKey) => void }) {
  const active = sort.key === k;
  return (
    <button onClick={() => onSort(k)} className={`flex items-center gap-1 text-left text-[11.5px] font-semibold ${active ? "text-ink" : "text-sub"}`}>
      {label}{active && <span className="text-[9px]">{sort.dir === "asc" ? "▲" : "▼"}</span>}
    </button>
  );
}

function DetailsView({ folders, files, selectedIds, sort, dropFolderId, onSort, onClickItem, onOpenFolder, onOpenFile, onFolderContext, onFileContext, onFileDragStart, onFolderDragOver, onFolderDragLeave, onFolderDrop }: {
  folders: DecryptedFolder[]; files: DecryptedFile[]; selectedIds: Set<string>; sort: Sort; dropFolderId: string | null;
  onSort: (k: SortKey) => void; onClickItem: (e: React.MouseEvent, id: string) => void; onOpenFolder: (id: string) => void; onOpenFile: (f: DecryptedFile) => void;
  onFolderContext: (e: React.MouseEvent, f: DecryptedFolder) => void; onFileContext: (e: React.MouseEvent, f: DecryptedFile) => void;
  onFileDragStart: (e: React.DragEvent, id: string) => void; onFolderDragOver: (e: React.DragEvent, id: string) => void; onFolderDragLeave: (id: string) => void; onFolderDrop: (e: React.DragEvent, id: string) => void;
}) {
  const cols = "minmax(0,2.4fr) 1.1fr 0.9fr 1.4fr";
  return (
    <div className="animate-nb-page pb-10">
      <div className="sticky top-0 z-[1] grid items-center border-b border-line bg-nav px-[18px] py-2.5" style={{ gridTemplateColumns: cols }}>
        <SortHead label="Name" k="name" sort={sort} onSort={onSort} />
        <SortHead label="Type" k="type" sort={sort} onSort={onSort} />
        <SortHead label="Size" k="size" sort={sort} onSort={onSort} />
        <SortHead label="Added" k="added" sort={sort} onSort={onSort} />
      </div>
      {folders.map((f) => (
        <div key={f.id} onClick={(e) => onClickItem(e, f.id)} onDoubleClick={(e) => { e.stopPropagation(); onOpenFolder(f.id); }} onContextMenu={(e) => onFolderContext(e, f)} onDragOver={(e) => onFolderDragOver(e, f.id)} onDragLeave={() => onFolderDragLeave(f.id)} onDrop={(e) => onFolderDrop(e, f.id)} style={{ gridTemplateColumns: cols, background: dropFolderId === f.id ? "rgba(0,0,0,0.1)" : selectedIds.has(f.id) ? "rgba(0,0,0,0.06)" : undefined }} className="grid select-none items-center border-b border-[#f4f5f8] px-[18px] py-2 hover:bg-black/[0.03]">
          <span className="flex min-w-0 items-center gap-2.5"><FolderIcon size={20} /><span className="truncate text-[12.5px] text-ink">{f.name}</span><span className="text-[9px]">🔒</span></span>
          <span className="font-mono text-[11.5px] text-sub">Folder</span>
          <span className="font-mono text-[11.5px] text-sub">{f.fileCount} files</span>
          <span className="font-mono text-[11px] text-sub2">{formatDate(f.createdAt)}</span>
        </div>
      ))}
      {files.map((f) => (
        <div key={f.id} draggable onDragStart={(e) => onFileDragStart(e, f.id)} onClick={(e) => onClickItem(e, f.id)} onDoubleClick={(e) => { e.stopPropagation(); onOpenFile(f); }} onContextMenu={(e) => onFileContext(e, f)} style={{ gridTemplateColumns: cols, background: selectedIds.has(f.id) ? "rgba(0,0,0,0.06)" : undefined }} className="grid select-none items-center border-b border-[#f4f5f8] px-[18px] py-2 hover:bg-black/[0.03]">
          <span className="flex min-w-0 items-center gap-2.5"><FileTypeIcon kind={fileKind(f.mimeType)} size={20} /><span className="truncate text-[12.5px] text-ink">{f.name}</span><span className="text-[9px]">🔒</span></span>
          <span className="font-mono text-[11.5px] text-sub">{extLabel(f.name, f.mimeType)}</span>
          <span className="font-mono text-[11.5px] text-sub">{formatBytes(f.size)}</span>
          <span className="font-mono text-[11px] text-sub2">{formatDate(f.createdAt)}</span>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onUpload, onNewFolder, inFolder }: { onUpload: () => void; onNewFolder?: () => void; inFolder: boolean }) {
  return (
    <div className="flex flex-col items-center px-5 py-16 text-center">
      <div className="mb-3.5 text-[#c4c8d0]"><BrandMark size={58} /></div>
      <p className="m-0 mb-[7px] text-[15px] font-semibold text-ink">{inFolder ? "This folder is quiet…" : "Your vault is empty"}</p>
      <p className="m-0 mb-[18px] max-w-[300px] text-[12.5px] leading-[1.55] text-[#7a7a7a]">Upload a file{onNewFolder ? " or create a folder" : ""} — everything is encrypted right here before it leaves your device.</p>
      <div className="flex gap-2.5">
        <button onClick={onUpload} className="w-btn-accent h-[34px] px-4">Upload file</button>
        {onNewFolder && <button onClick={onNewFolder} className="w-btn-ghost h-[34px] px-4">New folder</button>}
      </div>
    </div>
  );
}

export default function VaultPage() {
  return (
    <AuthGate>
      <VaultInner />
    </AuthGate>
  );
}
