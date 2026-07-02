// Client-side exponential backoff for LOCAL vault unlock attempts.
//
// IMPORTANT: this is UX-hardening only — it slows down manual password guessing
// on an already-open device. It is NOT protection against offline brute force:
// anyone who can read the wrapped VMK can attack it without this code path at
// all. The real protections are password entropy + the 600k-iteration KDF.
//
// State (fail count + last-attempt time) is stored in localStorage keyed by the
// vault/account id, so it survives reloads on that device.

const THRESHOLD = 3; // free attempts before backoff kicks in
const BASE_MS = 1000; // first penalty (after the 3rd failure)
const CAP_MS = 30_000; // maximum wait

export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface State {
  fails: number;
  last: number;
}

const memory = new Map<string, string>();
const memStore: KV = {
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => void memory.set(k, v),
  removeItem: (k) => void memory.delete(k),
};

function defaultStore(): KV {
  return typeof localStorage !== "undefined" ? localStorage : memStore;
}

const key = (id: string) => `nekobox.unlock.${id}`;

function read(id: string, store: KV): State | null {
  try {
    const raw = store.getItem(key(id));
    return raw ? (JSON.parse(raw) as State) : null;
  } catch {
    return null;
  }
}

/** Required wait after `fails` failures (0 while under the free threshold). */
export function requiredDelayMs(fails: number): number {
  if (fails < THRESHOLD) return 0;
  return Math.min(BASE_MS * 2 ** (fails - THRESHOLD), CAP_MS);
}

/** Milliseconds the user must still wait before the next attempt (0 = allowed). */
export function remainingBackoffMs(id: string, now: number = Date.now(), store: KV = defaultStore()): number {
  const st = read(id, store);
  if (!st) return 0;
  return Math.max(0, requiredDelayMs(st.fails) - (now - st.last));
}

export function failureCount(id: string, store: KV = defaultStore()): number {
  return read(id, store)?.fails ?? 0;
}

/** Record a failed unlock (increments the counter + timestamps it). */
export function recordUnlockFailure(id: string, now: number = Date.now(), store: KV = defaultStore()): void {
  const st = read(id, store) ?? { fails: 0, last: 0 };
  st.fails += 1;
  st.last = now;
  store.setItem(key(id), JSON.stringify(st));
}

/** Clear the counter after a successful unlock. */
export function recordUnlockSuccess(id: string, store: KV = defaultStore()): void {
  store.removeItem(key(id));
}
