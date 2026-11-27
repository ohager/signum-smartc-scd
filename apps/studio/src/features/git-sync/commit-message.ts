import type { Shas } from "@/lib/git-sync/plan";

const MAX_SUBJECT = 72;

/** A default commit message: a one-line summary, then `A`/`M`/`D` per path. */
export function suggestCommitMessage(changes: { upserts: string[]; deletes: string[] }, baseFiles: Shas): string {
  const lines = [
    ...changes.upserts.map((p) => ({ path: p, flag: Object.hasOwn(baseFiles, p) ? "M" : "A" })),
    ...changes.deletes.map((p) => ({ path: p, flag: "D" })),
  ].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  if (lines.length === 0) return "";
  let subject = lines.length === 1 ? `Update ${lines[0].path}` : `Update ${lines.length} files`;
  if (subject.length > MAX_SUBJECT) subject = `${subject.slice(0, MAX_SUBJECT - 1)}…`;
  return `${subject}\n\n${lines.map((l) => `${l.flag} ${l.path}`).join("\n")}`;
}
