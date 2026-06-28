"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/SessionProvider";
import { AuthScene } from "@/components/AuthScene";
import { RecoveryCodeModal } from "@/components/RecoveryCodeModal";

export default function RegisterPage() {
  const { register } = useSession();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (!ack) return setError("Please acknowledge the encryption warning.");
    setBusy(true);
    try {
      const code = await register(email, password);
      setRecoveryCode(code); // show it once before entering the vault
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
      setBusy(false);
    }
  }

  if (recoveryCode) {
    return <RecoveryCodeModal code={recoveryCode} onContinue={() => router.push("/vault")} />;
  }

  return (
    <AuthScene
      title="Create your vault"
      subtitle="Your private, encrypted space."
      footer={
        <>
          Already have a vault?{" "}
          <Link href="/login" className="font-bold text-white underline underline-offset-2">
            Unlock it
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit}>
        <div className="mb-[18px] flex items-start gap-2.5 rounded-[9px] border border-black/10 bg-black/[0.04] px-3 py-3">
          <span className="text-[15px]">🔐</span>
          <p className="m-0 text-[11.5px] leading-[1.55] text-[#3a3a3a]">
            <strong className="text-ink">Zero-knowledge.</strong> Your master password is the only
            key — we can never see or reset it. Lose it and your files are gone for good.
          </p>
        </div>

        <label className="w-label">Email</label>
        <input
          className="w-input mb-4"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <label className="w-label">Master password</label>
        <input
          className="w-input mb-4"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <label className="mb-[17px] flex cursor-pointer select-none items-start gap-2.5">
          <span
            className="mt-px flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-[4px] text-[11px] text-white"
            style={{
              border: `1.5px solid ${ack ? "#1a1a1a" : "#c4c8d0"}`,
              background: ack ? "#1a1a1a" : "#fff",
            }}
          >
            {ack ? "✓" : ""}
          </span>
          <input
            type="checkbox"
            className="sr-only"
            checked={ack}
            onChange={(e) => setAck(e.target.checked)}
          />
          <span className="text-[12px] leading-[1.45] text-[#4a4a4a]">
            I understand my password cannot be recovered.
          </span>
        </label>

        {error && (
          <p className="mb-3 rounded-md border border-[#f0d6d2] bg-[#fdf4f3] px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <button className="w-btn-accent w-full py-2.5" disabled={busy}>
          {busy ? "Creating vault…" : "Create vault"}
        </button>
        <p className="mt-3.5 text-center font-mono text-[10.5px] text-[#9a9a9a]">
          Decryption happens on this device only · AES-256-GCM
        </p>
      </form>
    </AuthScene>
  );
}
