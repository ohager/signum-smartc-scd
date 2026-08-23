import { describe, it, expect } from "bun:test";
import { runRequest } from "./run-request";
import type { TestEvent } from "./types";

async function run(js: string) {
  const events: TestEvent[] = [];
  await runRequest(
    { modules: { "/proj/a.test.ts": { js } }, rawFiles: {}, entryPaths: ["/proj/a.test.ts"] },
    (e) => events.push(e),
  );
  return events;
}

describe("console capture", () => {
  it("forwards console.log from inside a test, attributed to it", async () => {
    const events = await run(
      `const v = require("vitest"); v.it("t", () => { console.log("hello", 42); });`,
    );
    const line = events.find((e) => e.type === "console") as any;
    expect(line.text).toBe("hello 42");
    expect(line.level).toBe("log");
    expect(line.testId).toBe("/proj/a.test.ts#0");
  });

  it("formats bigints readably", async () => {
    const events = await run(`const v = require("vitest"); v.it("t", () => { console.log(5n); });`);
    expect((events.find((e) => e.type === "console") as any).text).toBe("5n");
  });

  it("captures warn and error levels", async () => {
    const events = await run(
      `const v = require("vitest"); v.it("t", () => { console.warn("w"); console.error("e"); });`,
    );
    const levels = events.filter((e) => e.type === "console").map((e: any) => e.level);
    expect(levels).toEqual(["warn", "error"]);
  });

  it("attributes output during collection to no test", async () => {
    const events = await run(`console.log("collecting"); const v = require("vitest");`);
    expect((events.find((e) => e.type === "console") as any).testId).toBeNull();
  });

  it("restores the original console afterwards", async () => {
    const original = console.log;
    await run(`const v = require("vitest"); v.it("t", () => { console.log("x"); });`);
    expect(console.log).toBe(original);
  });
});
