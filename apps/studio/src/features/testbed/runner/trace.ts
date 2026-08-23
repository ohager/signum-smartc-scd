import { serializeValue } from "../serialize-value";

export interface LineTrace {
  /** Display strings, oldest first, capped to `valuesPerLine`. */
  values: string[];
  /** How many times the line produced a value, including any dropped. */
  count: number;
  /** Set when an assertion on this line completed without throwing. */
  ok?: boolean;
  /** The bound name, when the line bound one. */
  name?: string;
  /**
   * The last value, rendered pretty and deep, for the Value tab.
   *
   * One per line rather than one per value: a loop running 30,000 times would
   * otherwise hold 30,000 detail strings, and the tab only ever shows the last.
   */
  detail?: string;
}

/** line → what happened on it. */
export type FileTrace = Record<number, LineTrace>;
/** file → lines. One of these is captured per test. */
export type TestTrace = Record<string, FileTrace>;

export interface TraceLimits {
  valuesPerLine: number;
  entriesPerTest: number;
}

export const DEFAULT_LIMITS: TraceLimits = { valuesPerLine: 100, entriesPerTest: 20_000 };

/** The detail view has a whole tab to fill, so it goes deeper and longer. */
const DETAIL_OPTIONS = { pretty: true, maxDepth: 6, maxLength: 20_000 } as const;

export interface TraceSink {
  /** Records a value and returns it unchanged, so it can wrap an expression. */
  value(file: string, line: number, name: string, value: unknown): unknown;
  /** Marks an assertion on this line as having completed. */
  ok(file: string, line: number): void;
  /** Returns the trace built since the last call, and starts a fresh one. */
  endTest(): { trace: TestTrace; truncated: boolean };
}

/**
 * Collects what instrumented code reports, within fixed budgets.
 *
 * Values are serialised on arrival rather than held as references — see
 * `serialize-value.ts` for why that is a correctness requirement, not a
 * memory optimisation.
 *
 * The per-test budget counts only values that grow memory. A line looping
 * 30,000 times fills its ring buffer once and then costs nothing more, so it
 * cannot starve other lines, and its buffer still holds the true last values.
 */
export function createTraceSink(limits: Partial<TraceLimits> = {}): TraceSink {
  const { valuesPerLine, entriesPerTest } = { ...DEFAULT_LIMITS, ...limits };

  let current: TestTrace = {};
  let entries = 0;
  let truncated = false;

  function lineOf(file: string, line: number): LineTrace {
    const forFile = (current[file] ??= {});
    return (forFile[line] ??= { values: [], count: 0 });
  }

  return {
    value(file, line, name, value) {
      const trace = lineOf(file, line);
      trace.name = name;
      trace.count++;
      // Overwritten each time, so it always describes the value the inline text
      // is showing.
      trace.detail = serializeValue(value, DETAIL_OPTIONS);

      if (trace.values.length >= valuesPerLine) {
        // Ring buffer is full: replacing costs no extra memory, so it does not
        // draw on the per-test budget.
        trace.values.shift();
        trace.values.push(serializeValue(value));
        return value;
      }

      if (entries >= entriesPerTest) {
        truncated = true;
        return value;
      }

      entries++;
      trace.values.push(serializeValue(value));
      return value;
    },

    ok(file, line) {
      lineOf(file, line).ok = true;
    },

    endTest() {
      const result = { trace: current, truncated };
      current = {};
      entries = 0;
      truncated = false;
      return result;
    },
  };
}
