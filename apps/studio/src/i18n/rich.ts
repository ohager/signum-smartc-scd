export type RichPart = string | { tag: string; text: string };

const TAG = /<(\w+)>([\s\S]*?)<\/\1>/g;

/**
 * Splits `<tag>…</tag>` spans out of a translated template. Only the names in
 * `tags` count; anything else stays literal text. Nothing is parsed as HTML.
 */
export function splitRich(template: string, tags: readonly string[]): RichPart[] {
  const parts: RichPart[] = [];
  let last = 0;
  let pending = "";
  for (const match of template.matchAll(TAG)) {
    const [whole, tag, text] = match;
    if (!tags.includes(tag)) continue;
    pending += template.slice(last, match.index);
    if (pending) parts.push(pending);
    pending = "";
    parts.push({ tag, text });
    last = match.index! + whole.length;
  }
  pending += template.slice(last);
  if (pending) parts.push(pending);
  return parts;
}
