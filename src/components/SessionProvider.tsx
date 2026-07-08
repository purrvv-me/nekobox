"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  createEmailRecoveryMaterial,
  createVmkVerifier,
  deriveKEK,
  DEFAULT_PBKDF2_ITERATIONS,
  generateVmk,
  generateRecoveryCode,
  deriveRecoveryKey,
  newSaltB64,
  unwrapVmk,
  wrapVmk,
} from "@/crypto/client";
import { remainingBackoffMs, recordUnlockFailure, recordUnlockSuccess } from "@/lib/unlockBackoff";

export interface SessionUser {
  id: string;
  email: string;
}

interface WrappedMaterial {
  kdfSalt: string;
  kdfIterations: number;
  wrappedVmk: string;
  wrappedVmkIv: string;
}

type Status = "loading" | "anon" | "locked" | "unlocked";

interface Keys {
  masterKey: CryptoKey; // the VMK — everything is encrypted under this
}

interface SessionContextValue {
  status: Status;
  user: SessionUser | null;
  keys: Keys | null;
  register: (email: string, password: string) => Promise<string>; // returns recovery code
  login: (email: string, password: string) => Promise<void>;
  unlock: (password: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  /** Opt-in: link an email as a backup recovery path (requires unlocked vault). */
  bindEmailRecovery: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [keys, setKeys] = useState<Keys | null>(null);
  const materialRef = useRef<WrappedMaterial | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!res.ok) {
          if (active) setStatus("anon");
          return;
        }
        const data = await res.json();
        if (!active) return;
        setUser({ id: data.id, email: data.email });
        materialRef.current = {
          kdfSalt: data.kdfSalt,
          kdfIterations: data.kdfIterations ?? 200_000,
          wrappedVmk: data.wrappedVmk,
          wrappedVmkIv: data.wrappedVmkIv,
        };
        setStatus("locked");
      } catch {
        if (active) setStatus("anon");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Derive PWK → unwrap the VMK.
  const hydrateKeys = useCallback(async (password: string, m: WrappedMaterial) => {
    const pwk = await deriveKEK(password, m.kdfSalt, m.kdfIterations);
    let vmk: CryptoKey;
    try {
      vmk = await unwrapVmk(pwk, { ciphertext: m.wrappedVmk, iv: m.wrappedVmkIv });
    } catch {
      throw new Error("Incorrect password — could not unlock your vault.");
    }
    setKeys({ masterKey: vmk });
    setStatus("unlocked");
    return vmk;
  }, []);

  const register = useCallback(async (email: string, password: string): Promise<string> => {
    // 1. Random VMK; wrap it under the password key and a recovery key.
    const kdfSalt = newSaltB64();
    const kdfIterations = DEFAULT_PBKDF2_ITERATIONS;
    const pwk = await deriveKEK(password, kdfSalt, kdfIterations);
    const vmk = await generateVmk();
    const wrappedVmk = await wrapVmk(pwk, vmk);
    const vmkVerifier = await createVmkVerifier(vmk);

    const recoveryCode = generateRecoveryCode();
    const recoverySalt = newSaltB64();
    const rwk = await deriveRecoveryKey(recoveryCode, recoverySalt);
    const recoveryWrappedVmk = await wrapVmk(rwk, vmk);

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        kdfSalt,
        kdfIterations,
        wrappedVmk: wrappedVmk.ciphertext,
        wrappedVmkIv: wrappedVmk.iv,
        vmkVerifier: vmkVerifier.ciphertext,
        vmkVerifierIv: vmkVerifier.iv,
        recoverySalt,
        recoveryWrappedVmk: recoveryWrappedVmk.ciphertext,
        recoveryWrappedVmkIv: recoveryWrappedVmk.iv,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "Registration failed");
    }
    const data = await res.json();
    setUser({ id: data.id, email: data.email });
    materialRef.current = {
      kdfSalt,
      kdfIterations,
      wrappedVmk: wrappedVmk.ciphertext,
      wrappedVmkIv: wrappedVmk.iv,
    };
    setKeys({ masterKey: vmk });
    setStatus("unlocked");
    return recoveryCode;
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Login failed");
      }
      const data = await res.json();
      setUser({ id: data.id, email: data.email });
      const m: WrappedMaterial = {
        kdfSalt: data.kdfSalt,
        kdfIterations: data.kdfIterations ?? 200_000,
        wrappedVmk: data.wrappedVmk,
        wrappedVmkIv: data.wrappedVmkIv,
      };
      materialRef.current = m;
      await hydrateKeys(password, m);
    },
    [hydrateKeys],
  );

  const unlock = useCallback(
    async (password: string) => {
      if (!materialRef.current) throw new Error("No session to unlock");
      const id = user?.id ?? "vault";
      const wait = remainingBackoffMs(id);
      if (wait > 0) throw new Error(`Too many attempts. Wait ${Math.ceil(wait / 1000)}s and try again.`);
      try {
        await hydrateKeys(password, materialRef.current);
        recordUnlockSuccess(id);
      } catch (e) {
        recordUnlockFailure(id); // UX-only: slows manual guessing on this device
        throw e;
      }
    },
    [hydrateKeys, user],
  );

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      if (!keys) throw new Error("Vault must be unlocked");
      // Re-wrap the same VMK under a key derived from the new password.
      const kdfSalt = newSaltB64();
      const kdfIterations = DEFAULT_PBKDF2_ITERATIONS;
      const newPwk = await deriveKEK(newPassword, kdfSalt, kdfIterations);
      const wrappedVmk = await wrapVmk(newPwk, keys.masterKey);
      const vmkVerifier = await createVmkVerifier(keys.masterKey);

      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          kdfSalt,
          kdfIterations,
          wrappedVmk: wrappedVmk.ciphertext,
          wrappedVmkIv: wrappedVmk.iv,
          vmkVerifier: vmkVerifier.ciphertext,
          vmkVerifierIv: vmkVerifier.iv,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Could not change password");
      }
      if (materialRef.current) {
        materialRef.current = {
          ...materialRef.current,
          kdfSalt,
          kdfIterations,
          wrappedVmk: wrappedVmk.ciphertext,
          wrappedVmkIv: wrappedVmk.iv,
        };
      }
    },
    [keys],
  );

  const bindEmailRecovery = useCallback(
    async (email: string) => {
      if (!keys) throw new Error("Vault must be unlocked");
      const mat = await createEmailRecoveryMaterial(keys.masterKey);
      const res = await fetch("/api/auth/email-recovery/bind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, ...mat }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Could not link the email");
      }
    },
    [keys],
  );

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setKeys(null);
    setUser(null);
    materialRef.current = null;
    setStatus("anon");
  }, []);

  return (
    <SessionContext.Provider
      value={{ status, user, keys, register, login, unlock, changePassword, bindEmailRecovery, logout }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
