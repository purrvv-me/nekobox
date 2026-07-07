import { chipMeta, FileKind } from "@/lib/format";

// NekoBox brand mark — an outlined open box with small paws, based on the
// product logo. Uses currentColor so it adapts to dark and light surfaces.
export function BrandMark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <g stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.2 9.35 12 5.85l7.8 3.5-7.8 3.75-7.8-3.75Z" />
        <path d="M4.2 9.35v6.85c0 .75.43 1.44 1.1 1.77L12 21.15l6.7-3.18c.67-.33 1.1-1.02 1.1-1.77V9.35" />
        <path d="M12 13.1v8.05" />
        <path d="M4.2 9.35 2.65 12l7.4 3.6L12 13.1" />
        <path d="M19.8 9.35 21.35 12l-7.4 3.6L12 13.1" />
      </g>
      <g fill="currentColor">
        <ellipse cx="9.05" cy="9.25" rx="0.92" ry="1.1" transform="rotate(-13 9.05 9.25)" />
        <ellipse cx="10.8" cy="8.72" rx="0.88" ry="1.08" transform="rotate(-4 10.8 8.72)" />
        <ellipse cx="13.2" cy="8.72" rx="0.88" ry="1.08" transform="rotate(4 13.2 8.72)" />
        <ellipse cx="14.95" cy="9.25" rx="0.92" ry="1.1" transform="rotate(13 14.95 9.25)" />
        <path d="M9.45 11.25c0-1.03.82-1.85 1.6-1.85.4 0 .68.24.95.56.27-.32.55-.56.95-.56.78 0 1.6.82 1.6 1.85 0 .82-.66 1.24-1.48 1.24-.47 0-.72-.15-1.07-.15s-.6.15-1.07.15c-.82 0-1.48-.42-1.48-1.24Z" />
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
