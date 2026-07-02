// Chunked, streaming AES-256-GCM for large files.
//
// Web Crypto's AES-GCM is one-shot, so a big file is split into fixed-size
// plaintext chunks, each encrypted independently. Memory use is bounded to a
// couple of chunks regardless of file size.
//
// On-the-wire format:
//   header (17 bytes):  "NBX1"(4) | version(1) | chunkSize:u32be(4) | baseNonce(8)
//   then N frames:      each = AES-GCM(chunk) = plaintextLen + 16-byte tag
//
// Per-chunk IV = baseNonce(8) || index:u32be(4)  → unique per (file, index).
// Each chunk's AAD = header || index:u32be || finalFlag(1). Binding the index
// and a "final" flag makes reordering, dropping, or truncating chunks fail the
// GCM authentication — you cannot silently lose the tail of a file.

import { bs, concatBytes, randomBytes, uint32BE } from "./codec";

export const DEFAULT_CHUNK_SIZE = 1024 * 1024; // 1 MiB plaintext / chunk
const MAGIC = Uint8Array.from([0x4e, 0x42, 0x58, 0x31]); // "NBX1"
const VERSION = 1;
const HEADER_LEN = 17;
const TAG_LEN = 16;

export interface StreamOptions {
  chunkSize?: number;
  /** Override the random 8-byte base nonce (mainly for tests). */
  baseNonce?: Uint8Array;
}

// ─── header helpers ───────────────────────────────────────────────────
function buildHeader(chunkSize: number, baseNonce: Uint8Array): Uint8Array<ArrayBuffer> {
  const h = new Uint8Array(HEADER_LEN);
  h.set(MAGIC, 0);
  h[4] = VERSION;
  new DataView(h.buffer).setUint32(5, chunkSize >>> 0, false);
  h.set(baseNonce, 9);
  return h;
}

function parseHeader(bytes: Uint8Array): { chunkSize: number; baseNonce: Uint8Array; header: Uint8Array } {
  if (bytes.length < HEADER_LEN) throw new Error("nekobox-stream: truncated header");
  for (let i = 0; i < 4; i++) if (bytes[i] !== MAGIC[i]) throw new Error("nekobox-stream: bad magic");
  if (bytes[4] !== VERSION) throw new Error(`nekobox-stream: unsupported version ${bytes[4]}`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, HEADER_LEN);
  const chunkSize = view.getUint32(5, false);
  if (chunkSize === 0 || chunkSize > 512 * 1024 * 1024) throw new Error("nekobox-stream: invalid chunk size");
  const baseNonce = bytes.slice(9, 17);
  return { chunkSize, baseNonce, header: bytes.slice(0, HEADER_LEN) };
}

function ivFor(baseNonce: Uint8Array, index: number): Uint8Array<ArrayBuffer> {
  const iv = new Uint8Array(12);
  iv.set(baseNonce, 0);
  new DataView(iv.buffer).setUint32(8, index >>> 0, false);
  return iv;
}

function aadFor(header: Uint8Array, index: number, final: boolean): Uint8Array<ArrayBuffer> {
  return concatBytes(header, uint32BE(index), Uint8Array.from([final ? 1 : 0]));
}

// ─── encryption ───────────────────────────────────────────────────────
/**
 * Encrypt a stream of arbitrary-sized input chunks into a stream of framed
 * output chunks. Input part boundaries do not matter — data is re-blocked into
 * fixed `chunkSize` pieces. Memory stays bounded (~one chunk + carry).
 */
export async function* encryptStream(
  source: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
  key: CryptoKey,
  opts: StreamOptions = {},
): AsyncGenerator<Uint8Array> {
  const chunkSize = opts.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const baseNonce = opts.baseNonce ?? randomBytes(8);
  if (baseNonce.length !== 8) throw new Error("baseNonce must be 8 bytes");
  const header = buildHeader(chunkSize, baseNonce);
  yield header;

  const encChunk = async (block: Uint8Array, index: number, final: boolean) => {
    const ct = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: ivFor(baseNonce, index), additionalData: aadFor(header, index, final) },
      key,
      bs(block),
    );
    return new Uint8Array(ct);
  };

  let carry: Uint8Array = new Uint8Array(0);
  let held: Uint8Array | null = null; // a full block held back until we know if it's last
  let index = 0;

  for await (const part of source as AsyncIterable<Uint8Array>) {
    carry = carry.length ? concatBytes(carry, part) : part;
    while (carry.length >= chunkSize) {
      const block = carry.slice(0, chunkSize);
      carry = carry.slice(chunkSize);
      if (held) yield await encChunk(held, index++, false);
      held = block;
    }
  }

  // Flush the tail. The very last emitted chunk carries final=true.
  if (held) {
    const heldIsFinal = carry.length === 0;
    yield await encChunk(held, index++, heldIsFinal);
  }
  if (carry.length > 0 || index === 0) {
    // trailing partial chunk, or an empty input (single empty final chunk)
    yield await encChunk(carry, index++, true);
  }
}

// ─── decryption ───────────────────────────────────────────────────────
/**
 * Decrypt a stream produced by {@link encryptStream}. Throws if any chunk was
 * tampered with, reordered, or if the stream was truncated (missing final chunk).
 */
export async function* decryptStream(
  source: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
  key: CryptoKey,
): AsyncGenerator<Uint8Array> {
  let buf: Uint8Array = new Uint8Array(0);
  let parsed: { chunkSize: number; baseNonce: Uint8Array; header: Uint8Array } | null = null;
  let frameLen = 0;
  let held: Uint8Array | null = null;
  let index = 0;

  const decChunk = async (frame: Uint8Array, idx: number, final: boolean) => {
    if (frame.length < TAG_LEN) throw new Error("nekobox-stream: truncated frame");
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivFor(parsed!.baseNonce, idx), additionalData: aadFor(parsed!.header, idx, final) },
      key,
      bs(frame),
    );
    return new Uint8Array(pt);
  };

  for await (const part of source as AsyncIterable<Uint8Array>) {
    buf = buf.length ? concatBytes(buf, part) : part;
    if (!parsed) {
      if (buf.length < HEADER_LEN) continue;
      parsed = parseHeader(buf.slice(0, HEADER_LEN));
      buf = buf.slice(HEADER_LEN);
      frameLen = parsed.chunkSize + TAG_LEN;
    }
    // Keep one full frame held back so we can tell which frame is final.
    while (buf.length > frameLen) {
      const frame = buf.slice(0, frameLen);
      buf = buf.slice(frameLen);
      if (held) yield await decChunk(held, index++, false);
      held = frame;
    }
  }

  if (!parsed) throw new Error("nekobox-stream: missing header");

  if (held) {
    const heldIsFinal = buf.length === 0;
    yield await decChunk(held, index++, heldIsFinal);
    if (!heldIsFinal) yield await decChunk(buf, index++, true);
  } else {
    // exactly one frame after the header (small or empty payload)
    yield await decChunk(buf, index++, true);
  }
}

// ─── convenience: whole-value + adapters ──────────────────────────────
/** Encrypt a whole byte array into a single framed blob (still chunk-safe). */
export async function encryptBytes(
  key: CryptoKey,
  data: Uint8Array,
  opts?: StreamOptions,
): Promise<Uint8Array<ArrayBuffer>> {
  return collect(encryptStream(oneShot(data), key, opts));
}

/** Decrypt a framed blob produced by {@link encryptBytes}/{@link encryptStream}. */
export async function decryptBytes(
  key: CryptoKey,
  framed: Uint8Array,
): Promise<Uint8Array<ArrayBuffer>> {
  return collect(decryptStream(oneShot(framed), key));
}

/** Yield a single value as an async source. */
export async function* oneShot(data: Uint8Array): AsyncGenerator<Uint8Array> {
  yield data;
}

/** Split a byte array into an async source of `partSize` pieces (for testing streams). */
export async function* chunkedSource(data: Uint8Array, partSize: number): AsyncGenerator<Uint8Array> {
  for (let o = 0; o < data.length; o += partSize) yield data.slice(o, o + partSize);
  if (data.length === 0) return;
}

/** Adapt a Blob/File to an async source of slices — true streaming in browsers. */
export async function* blobSource(blob: Blob, readSize = DEFAULT_CHUNK_SIZE): AsyncGenerator<Uint8Array> {
  for (let o = 0; o < blob.size; o += readSize) {
    const slice = blob.slice(o, Math.min(o + readSize, blob.size));
    yield new Uint8Array(await slice.arrayBuffer());
  }
}

/** Collect an async byte source into one array. */
export async function collect(source: AsyncIterable<Uint8Array>): Promise<Uint8Array<ArrayBuffer>> {
  const parts: Uint8Array[] = [];
  for await (const p of source) parts.push(p);
  return concatBytes(...parts);
}
