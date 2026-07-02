// NekoBox secure-crypto — a self-contained client-side encryption module.
//
// Pure Web Crypto (browser & Node 20+), no UI/backend/app dependencies.
//
//   • KDF        — PBKDF2 (default) or Argon2id via optional hash-wasm
//   • AES-256-GCM — seal/open for small values, wrap/unwrap for keys
//   • Streaming   — chunked file encryption with bounded memory + integrity
//   • Keyset      — master key wrapped by password AND a recovery code
//
// Quick start:
//   const { keyset, masterKey, recoveryCode } = await createVault(password);
//   const blob = await encryptBytes(masterKey, fileBytes);        // store blob + keyset
//   const key  = await unlockWithPassword(keyset, password);      // later…
//   const data = await decryptBytes(key, blob);

export * from "./codec";
export * from "./kdf";
export * from "./aes";
export * from "./stream";
export * from "./recovery";
export * from "./keyset";
export * from "./sharing";
export * from "./rsa";
