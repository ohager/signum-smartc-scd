import { describe, it, expect } from "bun:test";
import { createCollector } from "./test-api";

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
