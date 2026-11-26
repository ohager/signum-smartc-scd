import { describe, it, expect, beforeEach } from "bun:test";
import { createEditorTools } from "./editor-tools";
import { createEditorRegistry, type EditorEntry } from "../editor-registry";
import { AssistantFailure } from "./errors";
import { createTestFs } from "./test-fs";
import type { FileSystem } from "@/lib/file-system/file-system";

let fs: FileSystem;
let p: string;
let fileId: string;
let registry: ReturnType<typeof createEditorRegistry>;
let nav: { path: string; line?: number }[];
let tools: ReturnType<typeof createEditorTools>;

beforeEach(async () => {
  fs = createTestFs().fs;
  registry = createEditorRegistry();
  nav = [];
  tools = createEditorTools({ registry, fs, navigate: (path, line) => void nav.push({ path, line }) });
  p = await fs.createFolder(fs.rootFolderId, "p");
  fileId = await fs.addFile(p, "a.smart.c", "smartc", "int x;");
});

function entry(over: Partial<EditorEntry> = {}): EditorEntry {
  return {
    fileId,
    path: "/p/a.smart.c",
    getCursor: () => ({ line: 3, column: 5 }),
    getSelection: () => null,
    getDiagnostics: () => [],
    reveal: () => {},
    ...over,
  };
}

describe("get_editor_context", () => {
  it("with no editor reports file: null", async () => {
    expect(await tools.get_editor_context({})).toEqual({ file: null, cursor: null, selection: null, diagnostics: [] });
  });

  it("returns cursor, selection and diagnostics of the active editor", async () => {
    const diag = { line: 2, severity: "error" as const, message: "bad", source: "smartc" };
    registry.register(
      entry({
        getSelection: () => ({ from: { line: 3, column: 1 }, to: { line: 3, column: 4 }, text: "abc" }),
        getDiagnostics: () => [diag],
      }),
    );
    registry.setActive(fileId);
    expect(await tools.get_editor_context({})).toEqual({
      file: "/p/a.smart.c",
      cursor: { line: 3, column: 5 },
      selection: { from: { line: 3, column: 1 }, to: { line: 3, column: 4 }, text: "abc", truncated: false },
      diagnostics: [diag],
    });
  });

  it("caps the selection text at 2000 characters and the diagnostics at 100", async () => {
    const d = { line: 1, severity: "info" as const, message: "m", source: "s" };
    registry.register(
      entry({
        getSelection: () => ({ from: { line: 1, column: 1 }, to: { line: 9, column: 1 }, text: "x".repeat(2500) }),
        getDiagnostics: () => Array.from({ length: 150 }, () => d),
      }),
    );
    registry.setActive(fileId);
    const ctx = (await tools.get_editor_context({})) as any;
    expect(ctx.selection.text.length).toBe(2000);
    expect(ctx.selection.truncated).toBe(true);
    expect(ctx.diagnostics.length).toBe(100);
  });
});

describe("open_file", () => {
  it("navigates and reveals the line", async () => {
    const reveals: number[] = [];
    registry.register(entry({ reveal: (l) => void reveals.push(l) }));
    expect(await tools.open_file({ path: "/p/a.smart.c", line: 9 })).toEqual({ opened: "/p/a.smart.c" });
    expect(nav).toEqual([{ path: `/projects/${p}/files/${fileId}`, line: 9 }]);
    expect(reveals).toEqual([9]);
  });

  it("reveals once the editor mounts after the navigation", async () => {
    const reveals: number[] = [];
    await tools.open_file({ path: "/p/a.smart.c", line: 4 });
    expect(reveals).toEqual([]);
    registry.register(entry({ reveal: (l) => void reveals.push(l) }));
    expect(reveals).toEqual([4]);
  });

  it("a missing file is file_not_found and does not navigate", async () => {
    try {
      await tools.open_file({ path: "/p/nope.smart.c" });
      throw new Error("did not throw");
    } catch (e) {
      expect(e).toBeInstanceOf(AssistantFailure);
      expect((e as AssistantFailure).code).toBe("file_not_found");
    }
    expect(nav).toEqual([]);
  });
});
