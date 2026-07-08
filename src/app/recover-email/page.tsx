"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthScene } from "@/components/AuthScene";
import { RecoveryCodeModal } from "@/components/RecoveryCodeModal";
import {
  createVmkVerifier,
  deriveKEK,
  DEFAULT_PBKDF2_ITERATIONS,
  deriveRecoveryKey,
  generateRecoveryCode,
  newSaltB64,
  unwrapVmkWithErk,
  wrapVmk,
} from "@/crypto/client";

function RecoverEmailInner() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newCode, setNewCode] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("New password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    setBusy(true);
    try {
      // 1. Exchange the signed ticket for the email-recovery material.
      const matRes = await fetch("/api/auth/email-recovery/material", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!matRes.ok) {
        const b = await matRes.json().catch(() => ({}));
        throw new Error(b.error ?? "This recovery link is invalid or has expired");
      }
      const mat = await matRes.json();

      // 2. Unwrap the (unchanged) VMK locally with the released ERK.
      const vmk = await unwrapVmkWithErk(mat.erk, mat.emailWrappedVmk, mat.emailWrappedVmkIv);

      // 3. Rebuild fresh material: new password wrap + a brand-NEW recovery code.
      const kdfSalt = newSaltB64();
      const kdfIterations = DEFAULT_PBKDF2_ITERATIONS;
      const pwk = await deriveKEK(password, kdfSalt, kdfIterations);
      const wrappedVmk = await wrapVmk(pwk, vmk);
      const vmkVerifier = await createVmkVerifier(vmk);

      const code = generateRecoveryCode();
      const recoverySalt = newSaltB64();
      const rwk = await deriveRecoveryKey(code, recoverySalt);
      const recoveryWrapped = await wrapVmk(rwk, vmk);

      // 4. Complete — the server verifies + consumes the single-use ticket.
      const res = await fetch("/api/auth/email-recovery/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          newPassword: password,
          kdfSalt,
          kdfIterations,
          wrappedVmk: wrappedVmk.ciphertext,
          wrappedVmkIv: wrappedVmk.iv,
          vmkVerifier: vmkVerifier.ciphertext,
          vmkVerifierIv: vmkVerifier.iv,
          recoverySalt,
          recoveryWrappedVmk: recoveryWrapped.ciphertext,
          recoveryWrappedVmkIv: recoveryWrapped.iv,
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? "Could not complete recovery");
      }
      setNewCode(code); // show the NEW recovery code once
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recovery failed");
    } finally {
      setBusy(false);
    }
  }

  if (newCode) {
    return <RecoveryCodeModal code={newCode} onContinue={() => router.push("/login")} />;
  }

  if (!token) {
    return (
      <AuthScene title="Invalid link" subtitle="This recovery link is missing its token." footer={<Link href="/login" className="font-bold text-white underline underline-offset-2">Back to sign in</Link>}>
        <p className="m-0 text-center text-[13px] text-sub">
          Open the full link from the recovery email, or request a new one.
        </p>
      </AuthScene>
    );
  }

  return (
    <AuthScene
      title="Restore access"
      subtitle="Set a new password. You'll get a new recovery code."
      footer={<Link href="/login" className="font-bold text-white underline underline-offset-2">Back to sign in</Link>}
    >
      <form onSubmit={onSubmit}>
        <label className="w-label">New master password</label>
        <input className="w-input mb-4" type="password" autoComplete="new-password" placeholder="••••••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
        <label className="w-label">Confirm new password</label>
        <input className="w-input mb-4" type="password" autoComplete="new-password" placeholder="••••••••••••" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />

        {error && <p className="mb-3 rounded-md border border-[#f0d6d2] bg-[#fdf4f3] px-3 py-2 text-sm text-danger">{error}</p>}

        <button className="w-btn-accent w-full py-2.5" disabled={busy}>
          {busy ? "Restoring…" : "Set password & get new code"}
        </button>
        <p className="mt-3.5 text-center font-mono text-[10.5px] text-[#9a9a9a]">
          Link is single-use and expires in 15 minutes
        </p>
      </form>
    </AuthScene>
  );
}

export default function RecoverEmailPage() {
  return (
    <Suspense>
      <RecoverEmailInner />
    </Suspense>
  );
}
