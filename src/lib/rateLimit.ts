import "server-only";

// Lightweight in-memory sliding-window rate limiter. Good enough for a single
// instance / dev. For multi-instance production, back this with Redis or
// Cloudflare's rate limiting — the interface stays the same.

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
}

/**
 * @param key      unique caller identity (e.g. `upload:<userId>`)
 * @param limit    max requests allowed within the window
 * @param windowMs window length in milliseconds
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { hits: [] };
  // Drop hits outside the window.
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);

  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0];
    buckets.set(key, bucket);
    return { ok: false, remaining: 0, retryAfterMs: windowMs - (now - oldest) };
  }

  bucket.hits.push(now);
  buckets.set(key, bucket);
  return { ok: true, remaining: limit - bucket.hits.length, retryAfterMs: 0 };
}

// Periodically evict empty buckets so the map doesn't grow unbounded.
if (typeof setInterval !== "undefined") {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.hits.every((t) => now - t > 60_000)) buckets.delete(key);
    }
  }, 60_000);
  // Don't keep the process alive just for cleanup.
  if (typeof timer === "object" && "unref" in timer) (timer as NodeJS.Timeout).unref();
}
