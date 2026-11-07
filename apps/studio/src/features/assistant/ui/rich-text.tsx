import type { ReactNode } from "react";

/*
 * Translations carry **bold** and `code` as markers so one string stays one unit for
 * translators; this turns the markers into elements without raw HTML.
 */
export function RichText({ text }: { text: string }): ReactNode {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((part, i) => {
    if (part.startsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`")) return <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">{part.slice(1, -1)}</code>;
    return part;
  });
}
