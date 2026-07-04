"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/SessionProvider";
import { AuthScene } from "@/components/AuthScene";
import { RecoveryCodeModal } from "@/components/RecoveryCodeModal";

export function RegisterForm({ emailRecoveryEnabled }: { emailRecoveryEnabled: boolean }) {
  const { register, bindEmailRecovery } = useSession();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [ack, setAck] = useState(false);
  const [agreeLegal, setAgreeLegal] = useState(false);
  const [linkEmail, setLinkEmail] = useState(false); // opt-in, off by default
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [bindWarning, setBindWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (!ack) return setError("Please acknowledge the encryption warning.");
    if (!agreeLegal) return setError("Please agree to the Terms of Service and Privacy Policy.");
    if (emailRecoveryEnabled && linkEmail && !recoveryEmail.trim())
      return setError("Enter the recovery email or untick the option.");
    setBusy(true);
    try {
      const code = await register(email, password);
      if (emailRecoveryEnabled && linkEmail) {
        // Session is unlocked at this point — the bind derives its material
        // from the in-memory VMK. Best-effort: a failure must not lose the
        // recovery code screen.
        try {
          await bindEmailRecovery(recoveryEmail.trim().toLowerCase());
        } catch (err) {
          setBindWarning(err instanceof Error ? err.message : "Email link failed — you can retry later.");
        }
      }
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

        <label className="mb-[17px] flex cursor-pointer select-none items-start gap-2.5">
          <span
            className="mt-px flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-[4px] text-[11px] text-white"
            style={{
              border: `1.5px solid ${agreeLegal ? "#1a1a1a" : "#c4c8d0"}`,
              background: agreeLegal ? "#1a1a1a" : "#fff",
            }}
          >
            {agreeLegal ? "✓" : ""}
          </span>
          <input
            type="checkbox"
            className="sr-only"
            checked={agreeLegal}
            onChange={(e) => setAgreeLegal(e.target.checked)}
          />
          <span className="text-[12px] leading-[1.45] text-[#4a4a4a]">
            I agree to the{" "}
            <Link href="/terms" target="_blank" className="font-medium text-ink underline underline-offset-2">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" target="_blank" className="font-medium text-ink underline underline-offset-2">
              Privacy Policy
            </Link>
            .
          </span>
        </label>

        {/* Optional email recovery — explicit opt-in with an honest warning.
            Hidden entirely when the operator has disabled the feature (e.g. the
            sending domain isn't verified with the mail provider yet); the API
            routes reject it server-side too, so this is UX, not the only gate. */}
        {emailRecoveryEnabled && (
          <>
            <label className="mb-2 flex cursor-pointer select-none items-start gap-2.5">
              <span
                className="mt-px flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-[4px] text-[11px] text-white"
                style={{
                  border: `1.5px solid ${linkEmail ? "#1a1a1a" : "#c4c8d0"}`,
                  background: linkEmail ? "#1a1a1a" : "#fff",
                }}
              >
                {linkEmail ? "✓" : ""}
              </span>
              <input
                type="checkbox"
                className="sr-only"
                checked={linkEmail}
                onChange={(e) => setLinkEmail(e.target.checked)}
              />
              <span className="text-[12px] leading-[1.45] text-[#4a4a4a]">
                Link an email as a backup recovery path (optional)
              </span>
            </label>

            {linkEmail && (
              <div className="mb-4">
                <div className="mb-3 flex items-start gap-2.5 rounded-[9px] border border-[#fcd9b6] bg-[#fff7ed] px-3 py-3">
                  <span className="text-[14px]">⚠️</span>
                  <p className="m-0 text-[11.5px] leading-[1.55] text-[#7a4b13]">
                    <strong>This weakens strict zero-knowledge.</strong> Only a keyed hash of the
                    email is stored, but the server keeps material that — combined with access to
                    your mailbox (or a malicious operator) — can restore your vault key. It adds a
                    backup path if you lose your recovery code, at the cost of anonymity and the
                    &ldquo;server can never recover&rdquo; guarantee. Leave it off if unsure.
                  </p>
                </div>
                <label className="w-label">Recovery email</label>
                <input
                  className="w-input"
                  type="email"
                  placeholder="backup@example.com"
                  value={recoveryEmail}
                  onChange={(e) => setRecoveryEmail(e.target.value)}
                />
              </div>
            )}
          </>
        )}

        {bindWarning && (
          <p className="mb-3 rounded-md border border-[#fcd9b6] bg-[#fff7ed] px-3 py-2 text-sm text-[#7a4b13]">
            {bindWarning}
          </p>
        )}

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
