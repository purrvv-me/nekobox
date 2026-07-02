import type { FileKind } from "../lib/format";
import { KIND_LABEL } from "../lib/format";

const KIND_COLOR: Record<FileKind, string> = {
  image: "#3a3a3a",
  audio: "#4d4d4d",
  video: "#5a5a5a",
  doc: "#222",
  archive: "#666",
  other: "#444",
};

export function BrandMark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect x="3.5" y="5.5" width="17" height="14" rx="3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3.5 9.7h17" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="13.8" r="1.5" fill="currentColor" />
      <path d="M12 15v2.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function Lock() {
  return <span className="lock-badge">🔒</span>;
}

export function FolderGlyph({ size = 40 }: { size?: number }) {
  return (
    <span className="icon-wrap" style={{ width: size, height: size * 0.82 }}>
      <svg width={size} height={size * 0.82} viewBox="0 0 40 33" fill="none" aria-hidden>
        <path d="M4 5.5h11l3 3h18v3H4v-6z" fill="#c7c7c4" />
        <path d="M2 9.5h36a1.5 1.5 0 0 1 1.5 1.5v18a2 2 0 0 1-2 2H2.5a2 2 0 0 1-2-2V11a1.5 1.5 0 0 1 1.5-1.5z" fill="url(#fg)" stroke="#cfcfcc" strokeWidth="0.8" />
        <defs>
          <linearGradient id="fg" x1="0" y1="9" x2="0" y2="31" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ecece9" />
            <stop offset="1" stopColor="#d4d4d1" />
          </linearGradient>
        </defs>
      </svg>
    </span>
  );
}

export function FileGlyph({ kind, size = 44, lock = true }: { kind: FileKind; size?: number; lock?: boolean }) {
  const w = size * 0.66;
  return (
    <span className="icon-wrap" style={{ width: w, height: size }}>
      <svg width={w} height={size} viewBox="0 0 30 44" fill="none" aria-hidden>
        <path d="M1 4a3 3 0 0 1 3-3h17l8 8v31a3 3 0 0 1-3 3H4a3 3 0 0 1-3-3V4z" fill="url(#pg)" stroke="#d3deeb" strokeWidth="1" />
        <path d="M21 1l8 8h-8V1z" fill="#c2d0e0" />
        <rect x="1" y="31" width="28" height="12" rx="2.5" fill={KIND_COLOR[kind]} />
        <text x="15" y="39.6" textAnchor="middle" fontFamily="'JetBrains Mono',monospace" fontSize="7.5" fontWeight="700" fill="#fff" letterSpacing="0.4">
          {KIND_LABEL[kind]}
        </text>
        <defs>
          <linearGradient id="pg" x1="0" y1="1" x2="0" y2="43" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fff" />
            <stop offset="1" stopColor="#eef2f8" />
          </linearGradient>
        </defs>
      </svg>
      {lock && <Lock />}
    </span>
  );
}
