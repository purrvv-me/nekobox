import { beforeEach, describe, expect, it } from "vitest";
import {
  KV,
  requiredDelayMs,
  remainingBackoffMs,
  recordUnlockFailure,
  recordUnlockSuccess,
  failureCount,
} from "./unlockBackoff";

// A controllable in-memory store so tests don't depend on localStorage.
function fakeStore(): KV {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

let store: KV;
const ID = "vault_123";
beforeEach(() => {
  store = fakeStore();
});

describe("unlock backoff schedule", () => {
  it("no delay for the first 3 failures, then 1s → 2s → 4s → 8s, capped", () => {
    expect(requiredDelayMs(0)).toBe(0);
    expect(requiredDelayMs(2)).toBe(0);
    expect(requiredDelayMs(3)).toBe(1000);
    expect(requiredDelayMs(4)).toBe(2000);
    expect(requiredDelayMs(5)).toBe(4000);
    expect(requiredDelayMs(6)).toBe(8000);
    expect(requiredDelayMs(50)).toBe(30_000); // capped
  });
});

describe("backoff grows with failures and elapses over time", () => {
  it("returns a growing required wait as failures accumulate", () => {
    // 3 free attempts → still no wait
    recordUnlockFailure(ID, 0, store);
    recordUnlockFailure(ID, 0, store);
    recordUnlockFailure(ID, 0, store);
    expect(failureCount(ID, store)).toBe(3);
    expect(remainingBackoffMs(ID, 0, store)).toBe(1000); // after 3rd failure → 1s

    recordUnlockFailure(ID, 1000, store); // 4th failure at t=1000
    expect(remainingBackoffMs(ID, 1000, store)).toBe(2000); // needs 2s from t=1000

    // Partway through the window the remaining time shrinks…
    expect(remainingBackoffMs(ID, 2000, store)).toBe(1000);
    // …and once the window passes, attempts are allowed again.
    expect(remainingBackoffMs(ID, 3000, store)).toBe(0);
  });
});

describe("success resets the counter", () => {
  it("clears failures so there is no further delay", () => {
    for (let i = 0; i < 6; i++) recordUnlockFailure(ID, 0, store);
    expect(remainingBackoffMs(ID, 0, store)).toBeGreaterThan(0);

    recordUnlockSuccess(ID, store);
    expect(failureCount(ID, store)).toBe(0);
    expect(remainingBackoffMs(ID, 0, store)).toBe(0);
  });
});
