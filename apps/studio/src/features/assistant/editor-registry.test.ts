import { describe, it, expect } from "bun:test";
import { createEditorRegistry, type EditorEntry } from "./editor-registry";

function entry(fileId: string, reveals: number[] = []): EditorEntry {
  return {
    fileId,
    path: `/p/${fileId}.ts`,
    getCursor: () => ({ line: 1, column: 1 }),
    getSelection: () => null,
    getDiagnostics: () => [],
    reveal: (line) => void reveals.push(line),
  };
}

describe("editor registry", () => {
  it("follows focus", () => {
    const r = createEditorRegistry();
    r.register(entry("a"));
    r.register(entry("b"));
    r.setActive("a");
    r.setActive("b");
    expect(r.active()?.fileId).toBe("b");
  });

  it("falls back to the last focused editor still mounted when the active one unmounts", () => {
    const r = createEditorRegistry();
    r.register(entry("a"));
    const offB = r.register(entry("b"));
    const offC = r.register(entry("c"));
    r.setActive("a");
    r.setActive("b");
    r.setActive("c");
    offC();
    expect(r.active()?.fileId).toBe("b");
    offB();
    expect(r.active()?.fileId).toBe("a");
  });

  it("is null when nothing is left, or when focus is cleared", () => {
    const r = createEditorRegistry();
    const off = r.register(entry("a"));
    r.setActive("a");
    off();
    expect(r.active()).toBeNull();
    r.register(entry("a"));
    r.setActive("a");
    r.setActive(null);
    expect(r.active()).toBeNull();
  });

  it("a stale unregister does not remove a remounted editor", () => {
    const r = createEditorRegistry();
    const offOld = r.register(entry("a"));
    r.register(entry("a"));
    r.setActive("a");
    offOld();
    expect(r.active()?.fileId).toBe("a");
  });

  it("reveals at once when the editor is mounted", () => {
    const r = createEditorRegistry();
    const reveals: number[] = [];
    r.register(entry("a", reveals));
    r.revealWhenReady("a", 7);
    expect(reveals).toEqual([7]);
  });

  it("keeps a pending reveal until that file's editor registers, then applies it once", () => {
    const r = createEditorRegistry();
    const reveals: number[] = [];
    r.revealWhenReady("a", 12);
    const off = r.register(entry("a", reveals));
    expect(reveals).toEqual([12]);
    off();
    r.register(entry("a", reveals));
    expect(reveals).toEqual([12]);
  });

  it("drops a pending reveal when another file's editor registers first", () => {
    const r = createEditorRegistry();
    const reveals: number[] = [];
    r.revealWhenReady("a", 12);
    r.register(entry("b", reveals));
    r.register(entry("a", reveals));
    expect(reveals).toEqual([]);
  });

  it("a newer pending reveal replaces an earlier one", () => {
    const r = createEditorRegistry();
    const reveals: number[] = [];
    r.revealWhenReady("a", 1);
    r.revealWhenReady("b", 2);
    r.register(entry("a", reveals));
    r.register(entry("b", reveals));
    expect(reveals).toEqual([]);
    r.revealWhenReady("c", 3);
    r.register(entry("c", reveals));
    expect(reveals).toEqual([3]);
  });

  it("cancelReveal drops the pending request", () => {
    const r = createEditorRegistry();
    const reveals: number[] = [];
    r.revealWhenReady("a", 5);
    r.cancelReveal();
    r.register(entry("a", reveals));
    expect(reveals).toEqual([]);
  });

  it("passes the highlight range through, now or when the editor registers", () => {
    const r = createEditorRegistry();
    const seen: unknown[] = [];
    const e = (id: string): EditorEntry => ({ ...entry(id), reveal: (line, hl, text) => void seen.push([line, hl, text]) });
    r.register(e("a"));
    r.revealWhenReady("a", 3, [{ from: 3, to: 5 }], "txt");
    r.revealWhenReady("b", 9, [{ from: 9, to: 9 }]);
    r.register(e("b"));
    expect(seen).toEqual([[3, [{ from: 3, to: 5 }], "txt"], [9, [{ from: 9, to: 9 }], undefined]]);
  });

  it("falls back to the most recently registered editor when none ever had focus", () => {
    const r = createEditorRegistry();
    r.register(entry("a"));
    const offB = r.register(entry("b"));
    expect(r.active()?.fileId).toBe("b");
    offB();
    expect(r.active()?.fileId).toBe("a");
  });

  it("focus still wins over registration order", () => {
    const r = createEditorRegistry();
    r.register(entry("a"));
    r.register(entry("b"));
    r.setActive("a");
    expect(r.active()?.fileId).toBe("a");
  });
});
