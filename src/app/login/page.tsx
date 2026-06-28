"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/SessionProvider";
import { AuthScene } from "@/components/AuthScene";

export default function LoginPage() {
  const { login } = useSession();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      router.push("/vault");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScene
      title="Welcome back"
      subtitle="Unlock your encrypted vault."
      footer={
        <>
          No vault yet?{" "}
          <Link href="/register" className="font-bold text-white underline underline-offset-2">
            Create one
          </Link>
          <span className="mx-1.5 opacity-40">·</span>
          <Link href="/recover" className="text-white/80 underline underline-offset-2">
            Forgot password?
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit}>
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
          autoComplete="current-password"
          placeholder="••••••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && (
          <p className="mb-3 rounded-md border border-[#f0d6d2] bg-[#fdf4f3] px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <button className="w-btn-accent w-full py-2.5" disabled={busy}>
          {busy ? "Unlocking…" : "Unlock"}
        </button>
        <p className="mt-3.5 text-center font-mono text-[10.5px] text-[#9a9a9a]">
          Decryption happens on this device only · AES-256-GCM
        </p>
      </form>
    </AuthScene>
  );
}
