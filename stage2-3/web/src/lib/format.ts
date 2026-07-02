export type FileKind = "image" | "audio" | "video" | "doc" | "archive" | "other";

export function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > -1 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : "";
}

export function kindOf(name: string): FileKind {
  const e = extOf(name);
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"].includes(e)) return "image";
  if (["mp3", "wav", "ogg", "flac", "m4a", "aac"].includes(e)) return "audio";
  if (["mp4", "mov", "webm", "mkv", "avi"].includes(e)) return "video";
  if (["zip", "rar", "7z", "tar", "gz"].includes(e)) return "archive";
  if (["pdf", "doc", "docx", "xls", "xlsx", "ppt", "txt", "md", "csv", "json"].includes(e)) return "doc";
  return "other";
}

export const KIND_LABEL: Record<FileKind, string> = {
  image: "IMG",
  audio: "AUD",
  video: "VID",
  doc: "DOC",
  archive: "ZIP",
  other: "FILE",
};

export const KIND_FOLDER: { key: FileKind; label: string; icon: string }[] = [
  { key: "image", label: "Images", icon: "🖼" },
  { key: "doc", label: "Documents", icon: "📄" },
  { key: "audio", label: "Audio", icon: "🎵" },
  { key: "video", label: "Video", icon: "🎬" },
  { key: "archive", label: "Archives", icon: "🗜" },
  { key: "other", label: "Other", icon: "📦" },
];

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), u.length - 1);
  const v = bytes / 1024 ** i;
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
