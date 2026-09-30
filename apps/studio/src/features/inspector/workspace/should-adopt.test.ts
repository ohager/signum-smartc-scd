import { describe, expect, it } from "bun:test";
import { shouldAdopt } from "./should-adopt";

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
