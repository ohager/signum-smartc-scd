import { describe, it, expect } from "bun:test";
import { createCollector, runSuite } from "./test-api";
import type { TestEvent } from "./types";

async function eventsFor(build: (api: any) => void) {
  const { api, root } = createCollector("/x.test.ts");
  build(api);
  const events: TestEvent[] = [];
  await runSuite(root, "/x.test.ts", (e) => events.push(e));
  return events;
}

describe("run:plan", () => {
  it("is emitted before any test runs", async () => {
    const events = await eventsFor((api) => {
      api.it("a", () => {});
    });
    expect(events[0].type).toBe("run:plan");
  });

  it("lists every test including skipped and todo ones", async () => {
    const events = await eventsFor((api) => {
      api.describe("outer", () => {
        api.it("runs", () => {});
        api.it.skip("skipped", () => {});
        api.it.todo("later");
      });
    });
    const plan = events[0] as any;
    expect(plan.tests.map((t: any) => t.name)).toEqual(["runs", "skipped", "later"]);
  });

  it("carries each test's full path for labelling", async () => {
    const events = await eventsFor((api) => {
      api.describe("outer", () => {
        api.describe("inner", () => {
          api.it("deep", () => {});
        });
      });
    });
    expect((events[0] as any).tests[0].path).toEqual(["outer", "inner", "deep"]);
  });

  it("captures a definition stack naming the test file", async () => {
    const events = await eventsFor((api) => {
      api.it("a", () => {});
    });
    const stack = (events[0] as any).tests[0].stack as string;
    expect(typeof stack).toBe("string");
    expect(stack.length).toBeGreaterThan(0);
  });

  it("uses the same ids the test:end events use", async () => {
    const events = await eventsFor((api) => {
      api.it("a", () => {});
    });
    const planned = (events[0] as any).tests[0].id;
    const ended = events.find((e) => e.type === "test:end") as any;
    expect(ended.id).toBe(planned);
  });
});
