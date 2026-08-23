import { describe, it, expect } from "bun:test";
import { createMainThreadTransport } from "./main-thread-transport";
import type { TestEvent } from "./runner/types";

const request = {
  modules: {
    "/proj/a.test.ts": {
      js: `const v = require("vitest"); v.it("t", () => { v.expect(1n).toBe(1n); });`,
    },
  },
  rawFiles: {},
  entryPaths: ["/proj/a.test.ts"],
};

describe("createMainThreadTransport", () => {
  it("runs the request in-process and emits events", async () => {
    const transport = createMainThreadTransport();
    const events: TestEvent[] = [];
    const done = new Promise<void>((resolve) => {
      transport.onEvent((event) => {
        events.push(event);
        if (event.type === "run:end") resolve();
      });
    });

    transport.post(request as never);
    await done;

    const end = events.find((e) => e.type === "test:end") as any;
    expect(end.status).toBe("passed");
  });

  it("has a terminate that is safe to call", () => {
    const transport = createMainThreadTransport();
    expect(() => transport.terminate()).not.toThrow();
  });
});
