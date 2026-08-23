import { describe, it, expect } from "bun:test";
import { createTraceSink } from "./trace";

const FILE = "/proj/tests/a.test.ts";

describe("createTraceSink", () => {
  it("returns the value it was given, so it can wrap an expression", () => {
    const sink = createTraceSink();
    expect(sink.value(FILE, 1, "x", 42n)).toBe(42n);
  });

  it("records a value under its file, line and name", () => {
    const sink = createTraceSink();
    sink.value(FILE, 7, "counter", 2n);
    const { trace } = sink.endTest();
    expect(trace[FILE][7]).toEqual({ values: ["2n"], count: 1, name: "counter" });
  });

  it("counts repeats and keeps them in order", () => {
    const sink = createTraceSink();
    for (const n of [1n, 2n, 3n]) sink.value(FILE, 7, "r", n);
    const { trace } = sink.endTest();
    expect(trace[FILE][7].values).toEqual(["1n", "2n", "3n"]);
    expect(trace[FILE][7].count).toBe(3);
  });

  it("keeps the LAST values per line once the ring buffer is full", () => {
    const sink = createTraceSink({ valuesPerLine: 3 });
    for (const n of [1n, 2n, 3n, 4n, 5n]) sink.value(FILE, 7, "r", n);
    const { trace } = sink.endTest();
    expect(trace[FILE][7].values).toEqual(["3n", "4n", "5n"]);
    expect(trace[FILE][7].count).toBe(5);
  });

  it("does not let one hot line exhaust the per-test budget", () => {
    // The budget is 2 entries, but a single line may loop far more than twice
    // and must still yield the true last value plus a truthful count.
    const sink = createTraceSink({ valuesPerLine: 2, entriesPerTest: 2 });
    for (let n = 1; n <= 50; n++) sink.value(FILE, 7, "r", BigInt(n));
    const { trace, truncated } = sink.endTest();
    expect(trace[FILE][7].values).toEqual(["49n", "50n"]);
    expect(trace[FILE][7].count).toBe(50);
    expect(truncated).toBe(false);
  });

  it("stops recording and flags truncation when many distinct lines are touched", () => {
    const sink = createTraceSink({ entriesPerTest: 2 });
    sink.value(FILE, 1, "a", 1n);
    sink.value(FILE, 2, "b", 2n);
    sink.value(FILE, 3, "c", 3n);
    const { trace, truncated } = sink.endTest();
    expect(truncated).toBe(true);
    expect(trace[FILE][3].values).toEqual([]);
    // The count stays honest even when the value was dropped.
    expect(trace[FILE][3].count).toBe(1);
  });

  it("marks an assertion line as ok", () => {
    const sink = createTraceSink();
    sink.ok(FILE, 12);
    expect(sink.endTest().trace[FILE][12].ok).toBe(true);
  });

  it("separates files", () => {
    const sink = createTraceSink();
    sink.value(FILE, 1, "a", 1n);
    sink.value("/proj/tests/helpers/ctx.ts", 4, "b", 2n);
    const { trace } = sink.endTest();
    expect(Object.keys(trace).sort()).toEqual([
      "/proj/tests/a.test.ts",
      "/proj/tests/helpers/ctx.ts",
    ]);
  });

  it("resets between tests, so one test never shows another's values", () => {
    const sink = createTraceSink();
    sink.value(FILE, 1, "a", 1n);
    sink.endTest();
    sink.value(FILE, 2, "b", 2n);
    const { trace } = sink.endTest();
    expect(trace[FILE][1]).toBeUndefined();
    expect(trace[FILE][2].values).toEqual(["2n"]);
  });

  it("clears the truncated flag between tests", () => {
    const sink = createTraceSink({ entriesPerTest: 1 });
    sink.value(FILE, 1, "a", 1n);
    sink.value(FILE, 2, "b", 2n);
    expect(sink.endTest().truncated).toBe(true);
    expect(sink.endTest().truncated).toBe(false);
  });
});
