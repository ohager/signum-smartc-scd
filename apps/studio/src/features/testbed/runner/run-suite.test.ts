import { describe, it, expect } from "bun:test";
import { createCollector, runSuite } from "./test-api";
import type { TestEvent } from "./types";

async function collectAndRun(build: (api: any) => void) {
  const { api, root } = createCollector("/x.test.ts");
  build(api);
  const events: TestEvent[] = [];
  await runSuite(root, "/x.test.ts", (e) => events.push(e));
  return events;
}

const statuses = (events: TestEvent[]) =>
  events.filter((e) => e.type === "test:end").map((e: any) => e.status);

describe("runSuite", () => {
  it("emits start and end for a passing test", async () => {
    const events = await collectAndRun((api) => {
      api.it("passes", () => {});
    });
    expect(events[1].type).toBe("test:start");
    expect((events[2] as any).status).toBe("passed");
  });

  it("captures a failure with message, expected and actual", async () => {
    const events = await collectAndRun((api) => {
      api.it("fails", () => {
        api.expect(1n).toBe(2n);
      });
    });
    const end = events.find((e) => e.type === "test:end") as any;
    expect(end.status).toBe("failed");
    expect(end.failure.expected).toBe(2n);
    expect(end.failure.actual).toBe(1n);
    expect(end.failure.message).toContain("expected 1n to be 2n");
  });

  it("captures a thrown non-Error", async () => {
    const events = await collectAndRun((api) => {
      api.it("throws a string", () => {
        throw "boom";
      });
    });
    const end = events.find((e) => e.type === "test:end") as any;
    expect(end.failure.message).toBe("boom");
  });

  it("awaits async test bodies", async () => {
    const events = await collectAndRun((api) => {
      api.it("async fails", async () => {
        await Promise.resolve();
        throw new Error("late");
      });
    });
    const end = events.find((e) => e.type === "test:end") as any;
    expect(end.status).toBe("failed");
    expect(end.failure.message).toBe("late");
  });

  it("runs hooks outside-in for beforeEach and inside-out for afterEach", async () => {
    const order: string[] = [];
    await collectAndRun((api) => {
      api.beforeEach(() => order.push("outer-before"));
      api.afterEach(() => order.push("outer-after"));
      api.describe("inner", () => {
        api.beforeEach(() => order.push("inner-before"));
        api.afterEach(() => order.push("inner-after"));
        api.it("t", () => order.push("test"));
      });
    });
    expect(order).toEqual(["outer-before", "inner-before", "test", "inner-after", "outer-after"]);
  });

  it("runs beforeAll once per suite and afterAll after its tests", async () => {
    const order: string[] = [];
    await collectAndRun((api) => {
      api.describe("s", () => {
        api.beforeAll(() => order.push("all-before"));
        api.afterAll(() => order.push("all-after"));
        api.it("t1", () => order.push("t1"));
        api.it("t2", () => order.push("t2"));
      });
    });
    expect(order).toEqual(["all-before", "t1", "t2", "all-after"]);
  });

  it("skips a skipped test without running its body", async () => {
    let ran = false;
    const events = await collectAndRun((api) => {
      api.it.skip("skipped", () => {
        ran = true;
      });
    });
    expect(ran).toBe(false);
    expect(statuses(events)).toEqual(["skipped"]);
  });

  it("reports a todo test", async () => {
    const events = await collectAndRun((api) => {
      api.it.todo("later");
    });
    expect(statuses(events)).toEqual(["todo"]);
  });

  it("skips every test in a skipped suite", async () => {
    const events = await collectAndRun((api) => {
      api.describe.skip("s", () => {
        api.it("a", () => {});
        api.it("b", () => {});
      });
    });
    expect(statuses(events)).toEqual(["skipped", "skipped"]);
  });
});
