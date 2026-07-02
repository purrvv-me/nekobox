import { useCallback, useEffect, useState } from "react";
import { BrandMark } from "./icons";
import { OpenedShare, openSharedLink, peekShare } from "../lib/vault";
import { formatBytes, formatDate, kindOf } from "../lib/format";

interface Meta {
  name: string;
  size: number;
  expiresAt: number | null;
  opensRemaining: number | null;
}

export function SharePage({ id, fragment }: { id: string; fragment: string }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<(OpenedShare & { url: string; viewedAt: Date }) | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    peekShare(id, fragment)
      .then(setMeta)
      .catch((e) => setError(e instanceof Error ? e.message : "This link is invalid."));
  }, [id, fragment]);

  const open = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await openSharedLink(id, fragment);
      setOpened({ ...res, url: URL.createObjectURL(res.blob), viewedAt: new Date() });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open this file.");
    } finally {
      setBusy(false);
    }
  }, [id, fragment]);

  const save = () => {
    if (!opened) return;
    const a = document.createElement("a");
    a.href = opened.url;
    a.download = opened.name;
    a.rel = "noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const kind = meta ? kindOf(meta.name) : "other";

  return (
    <div className="share-page">
      <header className="share-top">
        <span className="tab-mark"><BrandMark size={12} /></span> NekoBox — shared file
      </header>

      <div className="share-wrap">
        {error && !opened ? (
          <div className="share-card center">
            <div className="share-x">⚠</div>
            <h2>Can’t open this link</h2>
            <p className="muted">{error}</p>
          </div>
        ) : !meta ? (
          <div className="share-card center"><p className="muted">Checking link…</p></div>
        ) : !opened ? (
          <div className="share-card center">
            <BrandMark size={40} />
            <h2>You’ve been sent a file</h2>
            <p className="fname">🔒 {meta.name}</p>
            <p className="muted mono">
              {formatBytes(meta.size)}
              {meta.expiresAt ? ` · expires ${formatDate(meta.expiresAt)}` : " · never expires"}
              {meta.opensRemaining !== null ? ` · ${meta.opensRemaining} open(s) left` : ""}
            </p>
            <p className="muted small">Decryption happens entirely in your browser — the server never sees the key.</p>
            <button className="btn accent" disabled={busy} onClick={open}>{busy ? "Decrypting…" : "Open & decrypt"}</button>
            {meta.opensRemaining !== null && meta.opensRemaining <= 1 && (
              <p className="warn small">Heads up: opening will use the last allowed view of this link.</p>
            )}
          </div>
        ) : (
          <div className="share-card">
            <div className="viewer">
              {kind === "image" ? (
                <img src={opened.url} alt={opened.name} />
              ) : kind === "audio" ? (
                <audio src={opened.url} controls autoPlay />
              ) : (
                <div className="viewer-generic">
                  <BrandMark size={40} />
                  <p className="fname">🔒 {opened.name}</p>
                  <p className="muted mono">{formatBytes(opened.size)} · decrypted locally</p>
                </div>
              )}
              <Watermark viewedAt={opened.viewedAt} />
            </div>
            <div className="viewer-bar">
              <span className="muted mono">🔓 Decrypted locally · viewed {opened.viewedAt.toISOString().replace("T", " ").slice(0, 19)} UTC</span>
              <button className="btn accent sm" onClick={save}>Download</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// A visible, tiled watermark stamped with the exact open time. It is not tied
// to any identity (the recipient is anonymous) — it simply makes the fact and
// time of viewing plainly visible over the content.
function Watermark({ viewedAt }: { viewedAt: Date }) {
  const label = `Viewed ${viewedAt.toISOString().replace("T", " ").slice(0, 19)} UTC`;
  return (
    <svg className="wm" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <pattern id="wm" width="300" height="150" patternUnits="userSpaceOnUse" patternTransform="rotate(-28)">
          <text x="0" y="60" className="wm-text">{label}</text>
          <text x="0" y="120" className="wm-text">NekoBox</text>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#wm)" />
    </svg>
  );
}
