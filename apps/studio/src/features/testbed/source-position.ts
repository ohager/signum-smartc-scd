export interface StackFrame {
  file: string;
  line: number;
  column: number;
}

// Matches the tail of a stack line in both shapes engines produce:
//   at name (/path/file.ts:12:9)
//   at /path/file.ts:12:9
const FRAME = /\(?([^()\s]+):(\d+):(\d+)\)?$/;

/**
 * The first frame belonging to `file`, or null.
 *
 * Frames name real project paths because the module registry appends
 * `//# sourceURL=<path>` to everything it evaluates.
 */
export function firstFrameIn(stack: string, file: string): StackFrame | null {
  for (const raw of stack.split("\n")) {
    const match = FRAME.exec(raw.trim());
    if (!match || match[1] !== file) continue;
    return { file: match[1], line: Number(match[2]), column: Number(match[3]) };
  }
  return null;
}

/**
 * How many lines `new Function` prepends before the body it is given.
 *
 * Every line number in a stack from evaluated code is shifted by this much.
 * It is 2 on both V8 and JSC today, but it is measured rather than assumed:
 * a wrong constant would put every gutter icon and every jump-to-line two
 * lines off, which reads as "roughly right" and wastes an afternoon.
 */
export function detectWrapperOffset(): number {
  const probe = new Function("return new Error().stack;\n//# sourceURL=__wrapper_probe__");
  const frame = firstFrameIn(String(probe()), "__wrapper_probe__");
  // The probe's `return` is on body line 1, so the offset is whatever was added.
  return frame ? frame.line - 1 : 2;
}
