/** Enums are edited as plain lines, `value = label`, one per line. */
export function enumToLines(values: Record<string, string>): string {
  return Object.entries(values)
    .map(([k, v]) => `${k} = ${v}`)
    .join("\n");
}

export function parseEnumLines(text: string): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(-?\d+)\s*=\s*(.+)$/.exec(line);
    if (!m) return null;
    out[m[1]!] = m[2]!.trim();
  }
  return out;
}
