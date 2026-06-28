// Trigger a browser "Save as" for a decrypted blob.
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke a tick later so the download has time to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
