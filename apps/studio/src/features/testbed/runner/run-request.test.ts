import { describe, it, expect } from "bun:test";
import { runRequest } from "./run-request";
import type { TestEvent } from "./types";

async function run(request: any) {
  const events: TestEvent[] = [];
  await runRequest(request, (e) => events.push(e));
  return events;
}

describe("runRequest", () => {
  it("runs tests collected from an entry file", async () => {
    const events = await run({
      modules: {
        "/proj/a.test.ts": {
          js: `const v = require("vitest");
               v.describe("s", () => { v.it("t", () => { v.expect(1n).toBe(1n); }); });`,
        },
      },
      rawFiles: {},
      entryPaths: ["/proj/a.test.ts"],
    });
    const end = events.find((e) => e.type === "test:end") as any;
    expect(end.status).toBe("passed");
  });

  it("exposes the real testbed package to tests", async () => {
    const events = await run({
      modules: {
        "/proj/a.test.ts": {
          js: `const v = require("vitest");
               const tb = require("signum-smartc-testbed");
               v.it("has the class", () => { v.expect(typeof tb.SimulatorTestbed).toBe("function"); });`,
        },
      },
      rawFiles: {},
      entryPaths: ["/proj/a.test.ts"],
    });
    expect((events.find((e) => e.type === "test:end") as any).status).toBe("passed");
  });

  it("reports a collection error instead of throwing", async () => {
    const events = await run({
      modules: { "/proj/a.test.ts": { js: `throw new Error("bad import");` } },
      rawFiles: {},
      entryPaths: ["/proj/a.test.ts"],
    });
    const error = events.find((e) => e.type === "collect:error") as any;
    expect(error.file).toBe("/proj/a.test.ts");
    expect(error.message).toBe("bad import");
  });

  it("continues to the next file after a collection error", async () => {
    const events = await run({
      modules: {
        "/proj/bad.test.ts": { js: `throw new Error("nope");` },
        "/proj/good.test.ts": {
          js: `const v = require("vitest"); v.it("t", () => {});`,
        },
      },
      rawFiles: {},
      entryPaths: ["/proj/bad.test.ts", "/proj/good.test.ts"],
    });
    expect(events.some((e) => e.type === "collect:error")).toBe(true);
    expect((events.find((e) => e.type === "test:end") as any).status).toBe("passed");
  });

  it("gives each entry file its own collector", async () => {
    const events = await run({
      modules: {
        "/proj/a.test.ts": { js: `const v = require("vitest"); v.it("a", () => {});` },
        "/proj/b.test.ts": { js: `const v = require("vitest"); v.it("b", () => {});` },
      },
      rawFiles: {},
      entryPaths: ["/proj/a.test.ts", "/proj/b.test.ts"],
    });
    const starts = events.filter((e) => e.type === "test:start") as any[];
    expect(starts.map((s) => s.file)).toEqual(["/proj/a.test.ts", "/proj/b.test.ts"]);
  });

  it("ends the run with a run:end event", async () => {
    const events = await run({
      modules: { "/proj/a.test.ts": { js: `const v = require("vitest"); v.it("t", () => {});` } },
      rawFiles: {},
      entryPaths: ["/proj/a.test.ts"],
    });
    expect(events[events.length - 1].type).toBe("run:end");
  });
});

describe("value traces", () => {
  it("instruments the module, so a plain binding is captured end to end", async () => {
    const events: TestEvent[] = [];
    await runRequest(
      {
        modules: {
          "/p/a.test.ts": {
            js: `const v = require("vitest");\nv.it("t", () => { const counter = 2n; v.expect(counter).toBe(2n); });`,
          },
        },
        rawFiles: {},
        entryPaths: ["/p/a.test.ts"],
      },
      (event) => events.push(event),
    );

    const end = events.find((e) => e.type === "test:end") as Extract<
      TestEvent,
      { type: "test:end" }
    >;
    expect(end.status).toBe("passed");
    // The source is uninstrumented here; run-request instruments it, which is
    // exactly what this asserts — the value arrives without the test doing
    // anything special. Line 2 carries both mechanisms: the `counter` binding
    // and the assertion that follows it on the same line.
    expect(end.trace!["/p/a.test.ts"][2]).toEqual({
      values: ["2n"],
      count: 1,
      name: "counter",
      detail: { kind: "leaf", text: "2n" },
      ok: true,
    });
  });

  it("does not leak one test's values into the next", async () => {
    const events: TestEvent[] = [];
    await runRequest(
      {
        modules: {
          "/p/a.test.ts": {
            js: `const v = require("vitest");
                 v.it("one", () => { __v(10,"a", 1n); });
                 v.it("two", () => { __v(20,"b", 2n); });`,
          },
        },
        rawFiles: {},
        entryPaths: ["/p/a.test.ts"],
      },
      (event) => events.push(event),
    );

    const ends = events.filter((e) => e.type === "test:end") as Array<
      Extract<TestEvent, { type: "test:end" }>
    >;
    expect(ends).toHaveLength(2);
    // Lines 10 and 20 are arbitrary labels chosen not to collide with line 1,
    // where instrumentation wraps this fixture's own `const v = require(...)`.
    expect(ends[0].trace!["/p/a.test.ts"][10].values).toEqual(["1n"]);
    expect(ends[0].trace!["/p/a.test.ts"][20]).toBeUndefined();
    expect(ends[1].trace!["/p/a.test.ts"][20].values).toEqual(["2n"]);
    expect(ends[1].trace!["/p/a.test.ts"][10]).toBeUndefined();
  });
});
