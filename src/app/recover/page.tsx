"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthScene } from "@/components/AuthScene";
import {
  deriveKEK,
  DEFAULT_PBKDF2_ITERATIONS,
  deriveRecoveryKey,
  newSaltB64,
  unwrapVmk,
  wrapVmk,
} from "@/crypto/client";

export default function RecoverPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("New password must be at least 8 characters.");
    setBusy(true);
    try {
      // 1. Fetch the recovery-wrapped VMK for this account.
      const matRes = await fetch("/api/auth/recover-material", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      if (!matRes.ok) {
        const b = await matRes.json().catch(() => ({}));
        throw new Error(b.error ?? "Could not start recovery");
      }
      const mat = await matRes.json();

      // 2. Unwrap the VMK with the recovery code (fails if the code is wrong).
      const rwk = await deriveRecoveryKey(code, mat.recoverySalt);
      let vmk: CryptoKey;
      try {
        vmk = await unwrapVmk(rwk, { ciphertext: mat.recoveryWrappedVmk, iv: mat.recoveryWrappedVmkIv });
      } catch {
        throw new Error("That recovery code is incorrect.");
      }

      // 3. Re-wrap the (unchanged) VMK under a key from the NEW password.
      const kdfSalt = newSaltB64();
      const kdfIterations = DEFAULT_PBKDF2_ITERATIONS;
      const newPwk = await deriveKEK(password, kdfSalt, kdfIterations);
      const wrappedVmk = await wrapVmk(newPwk, vmk);

      const resetRes = await fetch("/api/auth/recover-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          newPassword: password,
          kdfSalt,
          kdfIterations,
          wrappedVmk: wrappedVmk.ciphertext,
          wrappedVmkIv: wrappedVmk.iv,
        }),
      });
      if (!resetRes.ok) {
        const b = await resetRes.json().catch(() => ({}));
        throw new Error(b.error ?? "Could not reset password");
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recovery failed");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <AuthScene title="Password reset" subtitle="Your vault is unlocked with the new password." footer={<Link href="/login" className="font-bold text-white underline underline-offset-2">Go to sign in</Link>}>
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-black/[0.04] text-xl text-ink">✓</div>
          <p className="m-0 mb-4 text-[13px] leading-[1.5] text-sub">
            Your recovery code stays the same. Sign in with your new password.
          </p>
          <button onClick={() => router.push("/login")} className="w-btn-accent w-full py-2.5">Sign in</button>
        </div>
      </AuthScene>
    );
  }

  return (
    <AuthScene
      title="Recover your vault"
      subtitle="Use your recovery code to set a new password."
      footer={<Link href="/login" className="font-bold text-white underline underline-offset-2">Back to sign in</Link>}
    >
      <form onSubmit={onSubmit}>
        <label className="w-label">Email</label>
        <input className="w-input mb-4" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label className="w-label">Recovery code</label>
        <input className="w-input mb-4 font-mono" placeholder="ABCDE-FGHIJ-…" value={code} onChange={(e) => setCode(e.target.value)} required />
        <label className="w-label">New master password</label>
        <input className="w-input mb-4" type="password" autoComplete="new-password" placeholder="••••••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />

        {error && <p className="mb-3 rounded-md border border-[#f0d6d2] bg-[#fdf4f3] px-3 py-2 text-sm text-danger">{error}</p>}

        <button className="w-btn-accent w-full py-2.5" disabled={busy}>{busy ? "Recovering…" : "Reset password"}</button>
      </form>
    </AuthScene>
  );
}
