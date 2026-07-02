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
  deriveKEK,
  DEFAULT_PBKDF2_ITERATIONS,
  generateVmk,
  generateWrappedKeypair,
  generateRecoveryCode,
  deriveRecoveryKey,
  importPrivateKey,
  newSaltB64,
  unwrapVmk,
  wrapVmk,
} from "@/crypto/client";

export interface SessionUser {
  id: string;
  email: string;
}

interface WrappedMaterial {
  kdfSalt: string;
  kdfIterations: number;
  wrappedVmk: string;
  wrappedVmkIv: string;
  encPrivateKey: string;
  encPrivateKeyIv: string;
  publicKey: string;
}

type Status = "loading" | "anon" | "locked" | "unlocked";

interface Keys {
  masterKey: CryptoKey; // the VMK — everything is encrypted under this
  privateKey: CryptoKey;
  publicKey: string;
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
          encPrivateKey: data.encPrivateKey,
          encPrivateKeyIv: data.encPrivateKeyIv,
          publicKey: data.publicKey,
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

  // Derive PWK → unwrap VMK → unwrap RSA private key.
  const hydrateKeys = useCallback(async (password: string, m: WrappedMaterial) => {
    const pwk = await deriveKEK(password, m.kdfSalt, m.kdfIterations);
    let vmk: CryptoKey;
    try {
      vmk = await unwrapVmk(pwk, { ciphertext: m.wrappedVmk, iv: m.wrappedVmkIv });
    } catch {
      throw new Error("Incorrect password — could not unlock your vault.");
    }
    const privateKey = await importPrivateKey(vmk, m.encPrivateKey, m.encPrivateKeyIv);
    setKeys({ masterKey: vmk, privateKey, publicKey: m.publicKey });
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

    const recoveryCode = generateRecoveryCode();
    const recoverySalt = newSaltB64();
    const rwk = await deriveRecoveryKey(recoveryCode, recoverySalt);
    const recoveryWrappedVmk = await wrapVmk(rwk, vmk);

    // 2. RSA keypair for sharing, private key wrapped under the VMK.
    const kp = await generateWrappedKeypair(vmk);

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
        recoverySalt,
        recoveryWrappedVmk: recoveryWrappedVmk.ciphertext,
        recoveryWrappedVmkIv: recoveryWrappedVmk.iv,
        publicKey: kp.publicKey,
        encPrivateKey: kp.encPrivateKey,
        encPrivateKeyIv: kp.encPrivateKeyIv,
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
      encPrivateKey: kp.encPrivateKey,
      encPrivateKeyIv: kp.encPrivateKeyIv,
      publicKey: kp.publicKey,
    };
    const privateKey = await importPrivateKey(vmk, kp.encPrivateKey, kp.encPrivateKeyIv);
    setKeys({ masterKey: vmk, privateKey, publicKey: kp.publicKey });
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
        encPrivateKey: data.encPrivateKey,
        encPrivateKeyIv: data.encPrivateKeyIv,
        publicKey: data.publicKey,
      };
      materialRef.current = m;
      await hydrateKeys(password, m);
    },
    [hydrateKeys],
  );

  const unlock = useCallback(
    async (password: string) => {
      if (!materialRef.current) throw new Error("No session to unlock");
      await hydrateKeys(password, materialRef.current);
    },
    [hydrateKeys],
  );

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      if (!keys) throw new Error("Vault must be unlocked");
      // Re-wrap the same VMK under a key derived from the new password.
      const kdfSalt = newSaltB64();
      const kdfIterations = DEFAULT_PBKDF2_ITERATIONS;
      const newPwk = await deriveKEK(newPassword, kdfSalt, kdfIterations);
      const wrappedVmk = await wrapVmk(newPwk, keys.masterKey);

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
