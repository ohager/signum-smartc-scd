/** Ensure `name` ends with exactly one `ext` (idempotent). */
export function withExtension(name: string, ext: string): string {
  const base = name.endsWith(ext) ? name.slice(0, -ext.length) : name;
  return base + ext;
}

/**
 * Return a name not present in `existing`, appending -2, -3, … before the optional
 * extension. `name` may already include `ext`.
 */
export function uniqueName(name: string, existing: Iterable<string>, ext = ""): string {
  const set = new Set(existing);
  const base = ext && name.endsWith(ext) ? name.slice(0, -ext.length) : name;
  let candidate = base + ext;
  for (let n = 2; set.has(candidate); n++) candidate = `${base}-${n}${ext}`;
  return candidate;
}
