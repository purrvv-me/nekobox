// Tiny in-memory sliding-window rate limiter (single instance / demo).
// For production behind multiple instances, back this with Redis.

interface Bucket {
  hits: number[];
}
const buckets = new Map<string, Bucket>();

export function allow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key) ?? { hits: [] };
  b.hits = b.hits.filter((t) => now - t < windowMs);
  if (b.hits.length >= limit) {
    buckets.set(key, b);
    return false;
  }
  b.hits.push(now);
  buckets.set(key, b);
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.hits.every((t) => now - t > 600_000)) buckets.delete(k);
}, 120_000).unref?.();
