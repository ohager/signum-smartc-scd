import { describe, expect, it } from "bun:test";
import { reloadsOn, shouldAdopt } from "./should-adopt";

describe("shouldAdopt", () => {
  const base = { fileId: "f", eventFileId: "f", isDirty: false, current: "old", stored: "new" };

  it("adopts an external write to a clean buffer", () => {
    expect(shouldAdopt(base)).toBe(true);
  });

  it("never overwrites unsaved edits", () => {
    expect(shouldAdopt({ ...base, isDirty: true })).toBe(false);
  });

  it("ignores other files, echoes of its own save, and unreadable content", () => {
    expect(shouldAdopt({ ...base, eventFileId: "g" })).toBe(false);
    expect(shouldAdopt({ ...base, stored: "old" })).toBe(false);
    expect(shouldAdopt({ ...base, stored: undefined })).toBe(false);
  });
});

describe("reloadsOn", () => {
  it("reloads for its own file's updates and for a workspace another tab replaced", () => {
    expect(reloadsOn("file:updated", { id: "f" }, "f")).toBe(true);
    expect(reloadsOn("file:updated", { id: "g" }, "f")).toBe(false);
    expect(reloadsOn("fs:reloaded", undefined, "f")).toBe(true);
    expect(reloadsOn("file:renamed", { id: "f" }, "f")).toBe(false);
  });
});
