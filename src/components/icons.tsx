import { chipMeta, FileKind } from "@/lib/format";

// NekoBox brand mark — a monochrome outline of the open-box logo. Uses
// currentColor so the same glyph works on dark and light surfaces.
export function BrandMark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="4 8 56 56"
      fill="none"
      className={className}
      aria-hidden
    >
      <g fill="currentColor">
        <ellipse cx="25.7" cy="25.8" rx="3.1" ry="3.55" transform="rotate(-16 25.7 25.8)" />
        <ellipse cx="32" cy="24.15" rx="3.1" ry="3.65" />
        <ellipse cx="38.3" cy="25.8" rx="3.1" ry="3.55" transform="rotate(16 38.3 25.8)" />
        <path d="M24.85 33.35c0-4.75 3.8-8.25 7.15-8.25s7.15 3.5 7.15 8.25c0 2.95-2.38 4.5-5.1 4.5-.9 0-1.45-.28-2.05-.28s-1.15.28-2.05.28c-2.72 0-5.1-1.55-5.1-4.5Z" />
      </g>
      <g stroke="currentColor" strokeWidth="4.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13.8 26.6 32 16.8l18.2 9.8L32 36.45 13.8 26.6Z" />
        <path d="M13.8 26.6v17.05L32 54.2l18.2-10.55V26.6" />
        <path d="M32 36.45V54.2" />
        <path d="M13.8 26.6 7.5 34.95l16.35 8.65L32 36.45" />
        <path d="M50.2 26.6 56.5 34.95 40.15 43.6 32 36.45" />
      </g>
    </svg>
  );
}

// Windows 11 File Explorer-style icons in the NekoBox ink palette.

const KIND_COLOR: Record<FileKind, string> = {
  image: "#3a3a3a",
  audio: "#4d4d4d",
  video: "#5a5a5a",
  doc: "#222222",
  archive: "#666666",
  other: "#444444",
};

function LockBadge({ scale = 1 }: { scale?: number }) {
  return (
    <span
      className="absolute flex items-center justify-center rounded-full border border-[#d3dbe6] bg-white"
      style={{
        right: -3 * scale,
        bottom: -3 * scale,
        width: 16 * scale,
        height: 16 * scale,
        fontSize: 8 * scale,
      }}
    >
      🔒
    </span>
  );
}

export function FolderIcon({ size = 40, lock = false }: { size?: number; lock?: boolean }) {
  return (
    <span className="relative inline-flex" style={{ width: size, height: size * 0.82 }}>
      <svg width={size} height={size * 0.82} viewBox="0 0 40 33" fill="none" aria-hidden>
        <path d="M4 5.5h11l3 3h18a0 0 0 0 1 0 0v3H4v-6z" fill="#c7c7c4" />
        <path
          d="M2 9.5h36a1.5 1.5 0 0 1 1.5 1.5v18a2 2 0 0 1-2 2H2.5a2 2 0 0 1-2-2V11a1.5 1.5 0 0 1 1.5-1.5z"
          fill="url(#fold)"
          stroke="#cfcfcc"
          strokeWidth="0.8"
        />
        <defs>
          <linearGradient id="fold" x1="0" y1="9" x2="0" y2="31" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ecece9" />
            <stop offset="1" stopColor="#d4d4d1" />
          </linearGradient>
        </defs>
      </svg>
      {lock && <LockBadge scale={size / 40} />}
    </span>
  );
}

export function FileTypeIcon({
  kind,
  size = 44,
  lock = false,
}: {
  kind: FileKind;
  size?: number;
  lock?: boolean;
}) {
  const color = KIND_COLOR[kind];
  const label = chipMeta(kind).label;
  const w = size * 0.66;
  return (
    <span className="relative inline-flex" style={{ width: w, height: size }}>
      <svg width={w} height={size} viewBox="0 0 30 44" fill="none" aria-hidden>
        {/* page */}
        <path d="M1 4a3 3 0 0 1 3-3h17l8 8v31a3 3 0 0 1-3 3H4a3 3 0 0 1-3-3V4z" fill="url(#pg)" stroke="#d3deeb" strokeWidth="1" />
        {/* folded corner */}
        <path d="M21 1l8 8h-8V1z" fill="#c2d0e0" />
        {/* type badge */}
        <rect x="1" y="31" width="28" height="12" rx="2.5" fill={color} />
        <text
          x="15"
          y="39.6"
          textAnchor="middle"
          fontFamily="'JetBrains Mono', monospace"
          fontSize="7.5"
          fontWeight="700"
          fill="#fff"
          letterSpacing="0.4"
        >
          {label}
        </text>
        <defs>
          <linearGradient id="pg" x1="0" y1="1" x2="0" y2="43" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ffffff" />
            <stop offset="1" stopColor="#eef2f8" />
          </linearGradient>
        </defs>
      </svg>
      {lock && <LockBadge scale={size / 44} />}
    </span>
  );
}
