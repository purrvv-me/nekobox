// Client-safe formatting helpers (no server-only imports).

export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDate(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export type FileKind = "image" | "audio" | "video" | "archive" | "doc" | "other";

export function fileKind(mime: string): FileKind {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  if (/(zip|x-7z|x-rar|x-tar|gzip|compressed)/.test(mime)) return "archive";
  if (/(pdf|word|excel|text|json|csv|presentation|document)/.test(mime)) return "doc";
  return "other";
}

// Short uppercase chip label + warm ink shade per file kind (matches design).
export function chipMeta(kind: FileKind): { label: string; shade: string } {
  switch (kind) {
    case "image":
      return { label: "IMG", shade: "#7a766c" };
    case "audio":
      return { label: "AUD", shade: "#6e6a60" };
    case "video":
      return { label: "VID", shade: "#625e55" };
    case "archive":
      return { label: "ZIP", shade: "#827d72" };
    case "doc":
      return { label: "DOC", shade: "#56534b" };
    default:
      return { label: "FILE", shade: "#6b675d" };
  }
}

// Short extension shown in the mono metadata line, derived from the filename.
export function extLabel(name: string, mime: string): string {
  const dot = name.lastIndexOf(".");
  if (dot > -1 && dot < name.length - 1) return name.slice(dot + 1).toUpperCase().slice(0, 4);
  return fileKind(mime).toUpperCase();
}
