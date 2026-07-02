import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { OwnerShareItem, Session, VaultItem } from "../lib/vault";
import { formatBytes, formatDate } from "../lib/format";

type Ttl = "24h" | "7d" | "never";
type Limit = "unlimited" | "once" | "n";

export function ShareDialog({ session, item, onClose }: { session: Session; item: VaultItem; onClose: () => void }) {
  const [ttl, setTtl] = useState<Ttl>("7d");
  const [limit, setLimit] = useState<Limit>("unlimited");
  const [n, setN] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const ttlSeconds = ttl === "24h" ? 86_400 : ttl === "7d" ? 604_800 : undefined;
      const maxOpens = limit === "once" ? 1 : limit === "n" ? Math.max(1, Math.floor(n)) : undefined;
      const res = await session.createShare(item, { ttlSeconds, maxOpens });
      setUrl(res.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create share");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Share “${item.name}”`} onClose={onClose}>
      {url ? (
        <div>
          <p className="muted" style={{ marginTop: 0 }}>
            Anyone with this link can decrypt the file. The key is in the part after <b>#</b> and never
            reaches the server. Revoke it any time from “Shared links”.
          </p>
          <div className="linkbox">
            <input readOnly value={url} onFocus={(e) => e.target.select()} />
            <button className="btn accent sm" onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); }}>
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
          <div className="row end">
            <a className="btn ghost" href={url} target="_blank" rel="noreferrer noopener">Open link</a>
            <button className="btn accent" onClick={onClose}>Done</button>
          </div>
        </div>
      ) : (
        <div>
          <p className="lbl">Link expires</p>
          <div className="seg">
            {(["24h", "7d", "never"] as Ttl[]).map((v) => (
              <button key={v} className={ttl === v ? "on" : ""} onClick={() => setTtl(v)}>
                {v === "24h" ? "24 hours" : v === "7d" ? "7 days" : "Never"}
              </button>
            ))}
          </div>
          <p className="lbl" style={{ marginTop: 14 }}>Open limit</p>
          <div className="seg">
            {(["unlimited", "n", "once"] as Limit[]).map((v) => (
              <button key={v} className={limit === v ? "on" : ""} onClick={() => setLimit(v)}>
                {v === "unlimited" ? "Unlimited" : v === "n" ? "N times" : "One-time"}
              </button>
            ))}
          </div>
          {limit === "n" && (
            <input className="inp" style={{ marginTop: 10, width: 120 }} type="number" min={1} value={n} onChange={(e) => setN(Number(e.target.value))} />
          )}
          {error && <p className="err">{error}</p>}
          <div className="row end">
            <button className="btn ghost" onClick={onClose}>Cancel</button>
            <button className="btn accent" disabled={busy} onClick={create}>{busy ? "Encrypting…" : "Create link"}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function SharesManager({ session, onClose }: { session: Session; onClose: () => void }) {
  const [shares, setShares] = useState<OwnerShareItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => session.listShares().then(setShares).catch((e) => setError(String(e)));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function revoke(id: string) {
    if (!confirm("Revoke this link? It stops working immediately.")) return;
    try {
      await session.revokeShare(id);
      setShares((s) => (s ?? []).filter((x) => x.id !== id));
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <Modal title="Shared links" onClose={onClose} wide>
      {error && <p className="err">{error}</p>}
      {!shares ? (
        <p className="muted">Loading…</p>
      ) : shares.length === 0 ? (
        <p className="muted">No active share links.</p>
      ) : (
        <table className="shares">
          <thead><tr><th>File</th><th>Expires</th><th>Opens</th><th></th></tr></thead>
          <tbody>
            {shares.map((s) => (
              <tr key={s.id}>
                <td title={s.name}>🔒 {s.name}<br /><span className="muted mono">{formatBytes(s.size)} · {formatDate(s.createdAt)}</span></td>
                <td className="mono">{s.expiresAt ? formatDate(s.expiresAt) : "Never"}</td>
                <td className="mono">{s.opens}{s.maxOpens ? ` / ${s.maxOpens}` : ""}</td>
                <td><button className="btn danger sm" onClick={() => revoke(s.id)}>Revoke</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
