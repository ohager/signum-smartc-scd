/**
 * Trigger a browser download of `blob` under `filename`. The single DOM
 * boundary for the (headless) file-transfer core. Text callers wrap their
 * string themselves: `new Blob([text], { type: "text/plain;charset=utf-8" })`.
 */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
