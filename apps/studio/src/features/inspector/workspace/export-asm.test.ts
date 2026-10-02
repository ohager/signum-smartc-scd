import { describe, expect, it } from "bun:test";
import { asmFileName, exportAsm } from "./export-asm";

describe("asm export", () => {
  it("builds a unique, path-safe name", () => {
    expect(asmFileName("vb Stock/01", "123", [])).toBe("vb-Stock_01-123.asm");
    expect(asmFileName("x", "1", ["x-1.asm"])).toBe("x-1-2.asm");
  });

  it("writes an ASM file into the folder", async () => {
    const added: { name: string; type: string; content: string }[] = [];
    const fs = {
      listFolderContents: () => ({ files: [] }),
      addFile: async <T,>(_f: string, name: string, type: string, content: T) => {
        added.push({ name, type, content: content as string });
        return "id1";
      },
    };
    expect(await exportAsm(fs, "folder", "Market", "9", "FIN\n")).toEqual({ fileId: "id1", name: "Market-9.asm" });
    expect(added).toEqual([{ name: "Market-9.asm", type: "asm", content: "FIN\n" }]);
  });
});
