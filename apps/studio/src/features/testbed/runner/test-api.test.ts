import { describe, it, expect } from "bun:test";
import { createCollector, runSuite } from "./test-api";
import type { TestEvent } from "./types";

describe("collector", () => {
  it("collects tests into nested suites", () => {
    const { api, root } = createCollector("/x.test.ts");
    api.describe("outer", () => {
      api.it("a", () => {});
      api.describe("inner", () => {
        api.it("b", () => {});
      });
    });

    const outer = root.children[0] as any;
    expect(outer.kind).toBe("suite");
    expect(outer.name).toBe("outer");
    expect(outer.children[0].name).toBe("a");
    expect(outer.children[1].kind).toBe("suite");
    expect(outer.children[1].children[0].path).toEqual(["outer", "inner", "b"]);
  });

  it("does not execute test bodies while collecting", () => {
    const { api } = createCollector("/x.test.ts");
    let ran = false;
    api.describe("s", () => {
      api.it("t", () => {
        ran = true;
      });
    });
    expect(ran).toBe(false);
  });

  it("records modes for skip, only and todo", () => {
    const { api, root } = createCollector("/x.test.ts");
    api.it("plain", () => {});
    api.it.skip("skipped", () => {});
    api.it.only("focused", () => {});
    api.it.todo("later");
    expect(root.children.map((c: any) => c.mode)).toEqual(["run", "skip", "only", "todo"]);
  });

  it("gives every test a unique id scoped to the file", () => {
    const { api, root } = createCollector("/x.test.ts");
    api.it("a", () => {});
    api.it("b", () => {});
    const ids = root.children.map((c: any) => c.id);
    expect(ids).toEqual(["/x.test.ts#0", "/x.test.ts#1"]);
  });

  it("attaches hooks to the suite being collected", () => {
    const { api, root } = createCollector("/x.test.ts");
    api.beforeEach(() => {});
    api.describe("s", () => {
      api.beforeEach(() => {});
      api.beforeAll(() => {});
    });
    expect(root.beforeEach).toHaveLength(1);
    expect((root.children[0] as any).beforeEach).toHaveLength(1);
    expect((root.children[0] as any).beforeAll).toHaveLength(1);
  });

  it("exposes expect on the api", () => {
    const { api } = createCollector("/x.test.ts");
    expect(typeof api.expect).toBe("function");
  });

  it("restores the current suite when a describe callback throws", () => {
    const { api, root } = createCollector("/x.test.ts");
    expect(() =>
      api.describe("broken", () => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
    api.it("still lands at root", () => {});
    const stray = root.children.find((c: any) => c.kind === "test") as any;
    expect(stray.path).toEqual(["still lands at root"]);
  });
});

describe("filtered runs", () => {
  /** Collects the ids of tests that actually ran and passed. */
  async function runFiltered(build: (api: any) => void, filter?: string[]) {
    const { api, root } = createCollector("/p/a.test.ts");
    build(api);
    const events: TestEvent[] = [];
    await runSuite(root, "/p/a.test.ts", (event) => events.push(event), filter);
    return events
      .filter((e) => e.type === "test:end" && e.status === "passed")
      .map((e) => (e as any).id);
  }

  it("runs only the named test", async () => {
    const ran = await runFiltered((v) => {
      v.describe("s", () => {
        v.it("one", () => {});
        v.it("two", () => {});
      });
    }, ["s", "two"]);
    expect(ran).toHaveLength(1);
  });

  it("reports the tests it skipped rather than omitting them", async () => {
    const { api, root } = createCollector("/p/a.test.ts");
    api.describe("s", () => {
      api.it("one", () => {});
      api.it("two", () => {});
    });
    const events: TestEvent[] = [];
    await runSuite(root, "/p/a.test.ts", (e) => events.push(e), ["s", "two"]);
    const statuses = events.filter((e) => e.type === "test:end").map((e) => (e as any).status);
    expect(statuses.sort()).toEqual(["passed", "skipped"]);
  });

  it("still runs the hooks the filtered test depends on", async () => {
    const order: string[] = [];
    const { api, root } = createCollector("/p/a.test.ts");
    api.describe("s", () => {
      api.beforeAll(() => void order.push("beforeAll"));
      api.beforeEach(() => void order.push("beforeEach"));
      api.afterEach(() => void order.push("afterEach"));
      api.it("one", () => void order.push("one"));
      api.it("two", () => void order.push("two"));
    });
    await runSuite(root, "/p/a.test.ts", () => {}, ["s", "two"]);
    expect(order).toEqual(["beforeAll", "beforeEach", "two", "afterEach"]);
  });

  it("skips a whole suite the filter does not lead into", async () => {
    const order: string[] = [];
    const { api, root } = createCollector("/p/a.test.ts");
    api.describe("wanted", () => {
      api.it("t", () => void order.push("wanted"));
    });
    api.describe("other", () => {
      api.beforeAll(() => void order.push("other beforeAll"));
      api.it("t", () => void order.push("other"));
    });
    await runSuite(root, "/p/a.test.ts", () => {}, ["wanted", "t"]);
    expect(order).toEqual(["wanted"]);
  });

  it("runs a top-level test with a single-element filter", async () => {
    const ran = await runFiltered((v) => {
      v.it("alone", () => {});
      v.it("other", () => {});
    }, ["alone"]);
    expect(ran).toHaveLength(1);
  });

  it("overrides .only, since the filter is a more explicit request", async () => {
    const order: string[] = [];
    const { api, root } = createCollector("/p/a.test.ts");
    api.it.only("focused", () => void order.push("focused"));
    api.it("asked for", () => void order.push("asked for"));
    await runSuite(root, "/p/a.test.ts", () => {}, ["asked for"]);
    expect(order).toEqual(["asked for"]);
  });

  it("leaves .skip alone, which is a deliberate annotation in the source", async () => {
    const order: string[] = [];
    const { api, root } = createCollector("/p/a.test.ts");
    api.it.skip("skipped", () => void order.push("skipped"));
    await runSuite(root, "/p/a.test.ts", () => {}, ["skipped"]);
    expect(order).toEqual([]);
  });

  it("runs everything when there is no filter", async () => {
    const ran = await runFiltered((v) => {
      v.it("one", () => {});
      v.it("two", () => {});
    });
    expect(ran).toHaveLength(2);
  });
});
