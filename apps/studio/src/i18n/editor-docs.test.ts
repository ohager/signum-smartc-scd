import { describe, expect, it } from "bun:test";
import path from "path";
import { generateEditorDocs } from "../../scripts/i18n-editor-docs";
import { flattenMessages } from "./flatten";

describe("en/editor-docs.json", () => {
  const generated = generateEditorDocs();

  it("is generated from the language definitions (run `bun run i18n:docs`)", async () => {
    const file = path.join(import.meta.dir, "locales/en/editor-docs.json");
    expect(await Bun.file(file).text()).toBe(generated);
  });

  it("covers the whole documentation", () => {
    const keys = flattenMessages(JSON.parse(generated));
    expect(keys.size).toBeGreaterThan(400);
    expect(keys.get("builtins.getNextTx.detail")).toContain("next transaction");
    expect(keys.get("api.Get_A1.detail")).toBe("Returns the value of register slot A1.");
    expect(keys.get("opcodes.JMP.title")).toBe("Jump");
  });
});
