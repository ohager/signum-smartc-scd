import { describe, expect, it } from "bun:test";
import { planModelSync } from "./model-sync";

const f = (path: string, lastModified = 1) => ({ path, lastModified });
const none = { create: [], update: [], dispose: [] };

describe("planModelSync", () => {
  it("creates every .ts file except the open one", () =>
    expect(planModelSync(new Map(), [f("/p/a.test.ts"), f("/p/lib.ts"), f("/p/c.smart.c"), f("/p/ctx.ts")], "/p/a.test.ts")).toEqual({
      create: ["/p/lib.ts", "/p/ctx.ts"],
      update: [],
      dispose: [],
    }));

  it("updates a model whose file changed", () =>
    expect(planModelSync(new Map([["/p/lib.ts", 1]]), [f("/p/lib.ts", 2)], "/p/a.test.ts")).toEqual({
      create: [],
      update: ["/p/lib.ts"],
      dispose: [],
    }));

  it("leaves unchanged models alone", () =>
    expect(planModelSync(new Map([["/p/lib.ts", 1]]), [f("/p/lib.ts", 1)], "/p/a.test.ts")).toEqual(none));

  it("rename moves the model", () =>
    expect(planModelSync(new Map([["/p/lib.ts", 1]]), [f("/p/tests/lib.ts")], "/p/a.test.ts")).toEqual({
      create: ["/p/tests/lib.ts"],
      update: [],
      dispose: ["/p/lib.ts"],
    }));

  it("disposes models of deleted files", () =>
    expect(planModelSync(new Map([["/p/lib.ts", 1]]), [], "/p/a.test.ts")).toEqual({ create: [], update: [], dispose: ["/p/lib.ts"] }));

  it("never plans the open file", () => expect(planModelSync(new Map(), [f("/p/a.test.ts", 5)], "/p/a.test.ts")).toEqual(none));
});
