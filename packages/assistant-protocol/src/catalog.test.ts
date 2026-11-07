import { describe, expect, it } from "bun:test";
import { CATALOG, toolDef } from "./catalog";

describe("catalog", () => {
  it("has exactly the R1 tools", () => {
    expect(CATALOG.map((t) => t.name).sort()).toEqual(["analyze_gas", "compile", "create_project", "delete_file", "edit_file", "get_editor_context", "lint", "list_files", "list_projects", "open_file", "read_file", "run_tests", "write_file"]);
  });
  it("classifies kinds", () => {
    expect(CATALOG.filter((t) => t.kind === "write").map((t) => t.name).sort()).toEqual(["create_project", "delete_file", "edit_file", "write_file"]);
    expect(CATALOG.filter((t) => t.kind === "global").map((t) => t.name).sort()).toEqual(["get_editor_context", "list_projects"]);
  });
  it("pins timeouts", () => {
    expect(toolDef("compile")!.timeoutMs).toBe(30_000);
    expect(toolDef("run_tests")!.timeoutMs).toBe(120_000);
    expect(toolDef("read_file")!.timeoutMs).toBe(10_000);
  });
  it("rejects unknown keys and relative paths", () => {
    expect(toolDef("read_file")!.input.safeParse({ path: "a.smart.c" }).success).toBe(false);
    expect(toolDef("read_file")!.input.safeParse({ path: "/p/a.smart.c", x: 1 }).success).toBe(false);
    expect(toolDef("read_file")!.input.safeParse({ path: "/p/a.smart.c", from: 2 }).success).toBe(true);
  });
  it("has no wallet, account, network or deploy tool", () => {
    for (const t of CATALOG) expect(t.name).not.toMatch(/wallet|account|passphrase|network|deploy|send|sign/);
  });
  it("create_project promises only what it creates: the contract, no test starter", () => {
    const d = toolDef("create_project")!.description;
    expect(d).not.toMatch(/test/i);
    expect(d).toMatch(/contract/i);
  });
  it("returns undefined for unknown tools", () => {
    expect(toolDef("nope")).toBeUndefined();
  });
});
