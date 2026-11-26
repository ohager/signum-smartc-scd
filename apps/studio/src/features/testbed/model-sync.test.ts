import { describe, expect, it } from "bun:test";
import { ensureModel, planModelSync } from "./model-sync";

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

/* A stand-in for monaco.editor: models by URI string, disposal removes them, as in Monaco. */
function fakeEditor() {
  const models = new Map<string, { value: string; sets: number; getValue(): string; setValue(v: string): void; dispose(): void }>();
  return {
    models,
    getModel: (uri: { toString(): string }) => models.get(uri.toString()) ?? null,
    createModel: (value: string, _lang: string, uri: { toString(): string }) => {
      const model = {
        value,
        sets: 0,
        getValue: () => model.value,
        setValue: (v: string) => {
          model.value = v;
          model.sets++;
        },
        dispose: () => models.delete(uri.toString()),
      };
      models.set(uri.toString(), model);
      return model;
    },
  };
}
const uri = { toString: () => "file:///p/lib.ts" };

describe("ensureModel", () => {
  it("creates a missing model", () => {
    const editor = fakeEditor();
    ensureModel(editor as never, uri as never, "a");
    expect(editor.models.get(uri.toString())?.value).toBe("a");
  });

  it("brings back a model disposed since it was created (an editor closed mid-run)", () => {
    const editor = fakeEditor();
    ensureModel(editor as never, uri as never, "a");
    editor.models.get(uri.toString())!.dispose();
    ensureModel(editor as never, uri as never, "a");
    expect(editor.models.get(uri.toString())?.value).toBe("a");
  });

  it("updates changed text and leaves equal text alone", () => {
    const editor = fakeEditor();
    ensureModel(editor as never, uri as never, "a");
    ensureModel(editor as never, uri as never, "a");
    expect(editor.models.get(uri.toString())!.sets).toBe(0);
    ensureModel(editor as never, uri as never, "b");
    expect(editor.models.get(uri.toString())!.value).toBe("b");
  });
});
