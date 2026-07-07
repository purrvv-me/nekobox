// Ink rounded square holding the NekoBox brand mark, wordmark beside it.
import { BrandMark } from "./icons";

export function PawMark({ size = 26 }: { size?: number }) {
  return (
    <div
      className="flex flex-shrink-0 items-center justify-center rounded-[7px] bg-ink text-white"
      style={{ width: size, height: size }}
    >
      <BrandMark size={size * 0.78} />
    </div>
  );
}

export function Wordmark({ size = 26 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2">
      <PawMark size={size} />
      <span className="text-sm font-semibold tracking-[-0.01em] text-ink">NekoBox</span>
    </span>
  );
}
