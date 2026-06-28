"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface MenuItem {
  label: string;
  icon?: string;
  hint?: string;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  divider?: boolean;
}

export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const nx = Math.min(x, window.innerWidth - r.width - 8);
    const ny = Math.min(y, window.innerHeight - r.height - 8);
    setPos({ x: Math.max(8, nx), y: Math.max(8, ny) });
  }, [x, y]);

  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-[1000] w-[228px] animate-nb-ctx rounded-[9px] border border-[#e2e5eb] p-1.5 shadow-ctx"
      style={{
        left: pos.x,
        top: pos.y,
        background: "rgba(249,250,252,0.9)",
        backdropFilter: "blur(40px) saturate(1.6)",
        WebkitBackdropFilter: "blur(40px) saturate(1.6)",
        transformOrigin: "top left",
      }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) =>
        it.divider ? (
          <div key={i} className="mx-2 my-1.5 h-px bg-[#e6e9ef]" />
        ) : (
          <button
            key={i}
            disabled={it.disabled}
            onClick={() => {
              onClose();
              it.onClick?.();
            }}
            className={`flex h-[34px] w-full items-center gap-3 rounded-[5px] px-2.5 text-left transition-colors hover:bg-black/5 disabled:opacity-40 ${
              it.danger ? "text-danger" : "text-ink"
            }`}
          >
            <span className="w-4 text-center text-[14px]">{it.icon}</span>
            <span className="flex-1 text-[12.5px]">{it.label}</span>
            {it.hint && <span className="font-mono text-[10px] text-[#9a9a9a]">{it.hint}</span>}
          </button>
        ),
      )}
    </div>
  );
}
