import { TraceMap, originalPositionFor } from "@jridgewell/trace-mapping";
import { firstFrameIn } from "./source-position";
import type { CompiledModule } from "./runner/types";

export type LineResolver = (stack: string | undefined, file: string) => number | undefined;

/**
 * Builds a resolver turning a stack trace into a line in the user's TypeScript.
 *
 * Two corrections stand between a raw frame and a useful line: the frame's line
 * includes the lines `new Function` prepends, and the remainder addresses the
 * transpiled JavaScript rather than the source. Sourcemaps are parsed lazily and
 * cached, since one run resolves many frames from the same few files.
 */
export function createLineResolver(
  modules: Record<string, CompiledModule>,
  wrapperOffset: number,
): LineResolver {
  const maps = new Map<string, TraceMap | null>();

  function mapFor(file: string): TraceMap | null {
    const cached = maps.get(file);
    if (cached !== undefined) return cached;

    const raw = modules[file]?.sourceMap;
    let parsed: TraceMap | null = null;
    if (raw) {
      try {
        parsed = new TraceMap(JSON.parse(raw));
      } catch {
        // A corrupt map costs a jump-to-line, not the run.
        parsed = null;
      }
    }
    maps.set(file, parsed);
    return parsed;
  }

  return (stack, file) => {
    if (!stack) return undefined;

    const frame = firstFrameIn(stack, file);
    if (!frame) return undefined;

    const map = mapFor(file);
    if (!map) return undefined;

    const position = originalPositionFor(map, {
      line: frame.line - wrapperOffset,
      column: frame.column,
    });

    return position.line ?? undefined;
  };
}
