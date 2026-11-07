import { describe, expect, it } from "bun:test";
import { reloadsOn, shouldAdopt, writesBack } from "./should-adopt";

describe("shouldAdopt", () => {
  const base = { fileId: "f", eventFileId: "f", isDirty: false, locked: false, current: "old", stored: "new" };

  it("adopts an external write to a clean buffer", () => {
    expect(shouldAdopt(base)).toBe(true);
  });

  it("never overwrites unsaved edits", () => {
    expect(shouldAdopt({ ...base, isDirty: true })).toBe(false);
  });

  it("adopts into a dirty buffer while the project is locked: the agent owns it, and the round-start flush already saved the user's text", () => {
    expect(shouldAdopt({ ...base, isDirty: true, locked: true })).toBe(true);
  });

  it("a lock does not make it adopt other files, its own echo, or unreadable content", () => {
    expect(shouldAdopt({ ...base, locked: true, eventFileId: "g" })).toBe(false);
    expect(shouldAdopt({ ...base, locked: true, stored: "old" })).toBe(false);
    expect(shouldAdopt({ ...base, locked: true, stored: undefined })).toBe(false);
  });

  it("ignores another file's event", () => {
    expect(shouldAdopt({ ...base, eventFileId: "g" })).toBe(false);
  });

  it("ignores other files, echoes of its own save, and unreadable content", () => {
    expect(shouldAdopt({ ...base, eventFileId: "g" })).toBe(false);
    expect(shouldAdopt({ ...base, stored: "old" })).toBe(false);
    expect(shouldAdopt({ ...base, stored: undefined })).toBe(false);
  });
});

describe("writesBack", () => {
  it("writes when the project is not locked", () => {
    expect(writesBack({ locked: false, flushing: false })).toBe(true);
  });
  it("does not write into a locked project, so a stray autosave cannot overwrite the agent", () => {
    expect(writesBack({ locked: true, flushing: false })).toBe(false);
  });
  it("still writes the round-start flush, which runs after the lock and before the checkpoint", () => {
    expect(writesBack({ locked: true, flushing: true })).toBe(true);
  });
});

describe("reloadsOn", () => {
  it("reloads for its own file's updates and for a workspace another tab replaced", () => {
    expect(reloadsOn("file:updated", { id: "f" }, "f")).toBe(true);
    expect(reloadsOn("file:updated", { id: "g" }, "f")).toBe(false);
    expect(reloadsOn("fs:reloaded", undefined, "f")).toBe(true);
    expect(reloadsOn("fs:reloaded", { id: "g" }, "f")).toBe(true);
    expect(reloadsOn("file:renamed", { id: "f" }, "f")).toBe(false);
  });
});
