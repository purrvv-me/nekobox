"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "./SessionProvider";
import { AuthScene } from "./AuthScene";
import { BrandMark } from "./icons";

// Renders children only when the vault is unlocked. loading → spinner,
// anon → redirect to /login, locked → unlock prompt.
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { status, unlock, logout, user } = useSession();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === "anon") router.replace("/login");
  }, [status, router]);

  if (status === "loading" || status === "anon") {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-ink"><BrandMark size={34} /></div>
      </main>
    );
  }

  if (status === "locked") {
    return (
      <AuthScene
        title="Vault locked"
        subtitle={user?.email ? `Unlock the vault for ${user.email}` : "Re-enter your password"}
        footer={
          <button
            onClick={async () => {
              await logout();
              router.push("/login");
            }}
            className="font-bold text-white underline underline-offset-2"
          >
            Sign out
          </button>
        }
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            setBusy(true);
            try {
              await unlock(password);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Unlock failed");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="w-label">Master password</label>
          <input
            className="w-input mb-4"
            type="password"
            autoFocus
            placeholder="••••••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && (
            <p className="mb-3 rounded-md border border-[#f0d6d2] bg-[#fdf4f3] px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          <button className="w-btn-accent w-full py-2.5" disabled={busy}>
            {busy ? "Unlocking…" : "Unlock"}
          </button>
        </form>
      </AuthScene>
    );
  }

  return <>{children}</>;
}
