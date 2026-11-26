/*
 * Line diff for the editor gutter: what changed in a file since a round's checkpoint.
 * Line numbers refer to the NEW text (1-based) because that is what the editor shows.
 * No dependency: projects are small, and the gutter needs ranges, not patches.
 */

export interface LineChange {
  kind: "added" | "changed" | "deleted";
  startLine: number;
  endLine: number;
  /* The replaced or removed text; empty for "added". */
  oldText: string;
}

/* LCS is O(n*m) in time and memory; past this the gutter degrades to one block instead of freezing the tab. */
const MAX_LINES = 5000;

/* An empty text has no lines (not one empty line), so "" -> "a" is a pure insertion. */
function linesOf(text: string): string[] {
  return text === "" ? [] : text.split("\n");
}

export function diffLines(before: string, after: string): LineChange[] {
  if (before === after) return [];
  const a = linesOf(before);
  const b = linesOf(after);

  /* Identical edges are the common case (an edit in the middle); trimming them keeps the table small. */
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const x = a.slice(head, a.length - tail);
  const y = b.slice(head, b.length - tail);

  if (x.length > MAX_LINES || y.length > MAX_LINES) {
    return [{ kind: "changed", startLine: 1, endLine: Math.max(1, b.length), oldText: before }];
  }

  const n = x.length;
  const m = y.length;
  const width = m + 1;
  /* lcs[i][j] = LCS length of x[i..] and y[j..]; 16 bits suffice below MAX_LINES. */
  const lcs = new Uint16Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * width + j] =
        x[i] === y[j] ? lcs[(i + 1) * width + j + 1]! + 1 : Math.max(lcs[(i + 1) * width + j]!, lcs[i * width + j + 1]!);
    }
  }

  const changes: LineChange[] = [];
  let i = 0;
  let j = 0;
  /* Pending hunk: consecutive removed and inserted lines between two matches. */
  let removed: string[] = [];
  let insertedFrom = -1;
  let insertedCount = 0;

  const flush = () => {
    if (removed.length === 0 && insertedCount === 0) return;
    /* Line numbers in the new text: the hunk begins after `head` shared lines plus the new lines seen so far. */
    const newStart = head + (insertedCount > 0 ? insertedFrom : j) + 1;
    if (insertedCount > 0) {
      changes.push({
        kind: removed.length > 0 ? "changed" : "added",
        startLine: newStart,
        endLine: newStart + insertedCount - 1,
        oldText: removed.join("\n"),
      });
    } else {
      const after = Math.max(1, newStart - 1);
      changes.push({ kind: "deleted", startLine: after, endLine: after, oldText: removed.join("\n") });
    }
    removed = [];
    insertedFrom = -1;
    insertedCount = 0;
  };

  while (i < n || j < m) {
    if (i < n && j < m && x[i] === y[j]) {
      flush();
      i++;
      j++;
    } else if (j < m && (i === n || lcs[i * width + j + 1]! >= lcs[(i + 1) * width + j]!)) {
      if (insertedCount === 0) insertedFrom = j;
      insertedCount++;
      j++;
    } else {
      removed.push(x[i]!);
      i++;
    }
  }
  flush();
  return changes;
}
