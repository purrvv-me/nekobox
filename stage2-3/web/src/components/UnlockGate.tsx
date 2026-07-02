import { useState } from "react";
import { BrandMark } from "./icons";
import { Session, createLocalVault, unlock, recover, hasLocalVault, forgetLocalVault } from "../lib/vault";

type Mode = "create" | "unlock" | "recover" | "showcode";

export function UnlockGate({ onSession }: { onSession: (s: Session) => void }) {
  const [mode, setMode] = useState<Mode>(hasLocalVault() ? "unlock" : "create");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [code, setCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [pendingSession, setPendingSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "create") {
      if (password.length < 8) return setError("Password must be at least 8 characters.");
      run(async () => {
        const { recoveryCode, session } = await createLocalVault(password);
        setRecoveryCode(recoveryCode);
        setPendingSession(session);
        setMode("showcode");
      });
    } else if (mode === "unlock") {
      run(async () => onSession(await unlock(password)));
    } else if (mode === "recover") {
      if (password.length < 8) return setError("New password must be at least 8 characters.");
      run(async () => onSession(await recover(code, password)));
    }
  };

  return (
    <div className="scene">
      <div className="scene-star s1" /><div className="scene-star s2" /><div className="scene-star s3" />
      <div className="scene-card">
        <div className="scene-head">
          <div className="scene-avatar"><BrandMark size={44} /></div>
          <h1>{mode === "create" ? "Create your vault" : mode === "recover" ? "Recover your vault" : mode === "showcode" ? "Save your recovery code" : "Unlock your vault"}</h1>
          <p>Encrypted on this device — the server never sees your keys.</p>
        </div>

        {mode === "showcode" ? (
          <div className="card">
            <p className="warn">This code is the <b>only</b> way back in if you forget your password. Store it somewhere safe — it is shown once.</p>
            <div className="reccode">{recoveryCode}</div>
            <div className="row">
              <button className="btn ghost" type="button" onClick={() => navigator.clipboard?.writeText(recoveryCode)}>Copy</button>
              <button className="btn accent" type="button" onClick={() => pendingSession && onSession(pendingSession)}>I saved it — continue</button>
            </div>
          </div>
        ) : (
          <form className="card" onSubmit={submit}>
            {mode === "recover" && (
              <>
                <label className="lbl">Recovery code</label>
                <input className="inp" value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX-…" autoFocus />
              </>
            )}
            <label className="lbl">{mode === "create" || mode === "recover" ? "New password" : "Password"}</label>
            <input className="inp" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••••" autoFocus={mode !== "recover"} />
            {mode === "create" && (
              <>
                <label className="lbl">Confirm password</label>
                <input className="inp" type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} placeholder="••••••••••••" />
              </>
            )}
            {error && <p className="err">{error}</p>}
            <button className="btn accent full" disabled={busy || (mode === "create" && password !== password2)}>
              {busy ? "Working…" : mode === "create" ? "Create vault" : mode === "recover" ? "Recover" : "Unlock"}
            </button>
            <div className="links">
              {mode === "unlock" && <a onClick={() => { setMode("recover"); setError(null); }}>Forgot password?</a>}
              {mode === "recover" && <a onClick={() => { setMode("unlock"); setError(null); }}>Back to unlock</a>}
              {mode === "unlock" && (
                <a onClick={() => { if (confirm("Reset the device vault? Existing files become unreadable.")) { forgetLocalVault(); setMode("create"); } }}>
                  Reset device vault
                </a>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
