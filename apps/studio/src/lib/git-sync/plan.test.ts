import { describe, expect, it } from "bun:test";
import { GitSyncError } from "./errors.ts";
import { localChanges, planPull, resolvePull, syncState } from "./plan.ts";

describe("plan", () => {
  it("takes remote-only changes", () => {
    expect(planPull({ a: "1", d: "1" }, { a: "1", d: "1" }, { a: "2", n: "9" })).toEqual({
      actions: [{ kind: "write", relPath: "a" }, { kind: "delete", relPath: "d" }, { kind: "write", relPath: "n" }],
      conflicts: [],
    });
  });
  it("keeps local-only changes and ignores identical changes", () => {
    expect(planPull({ a: "1", b: "1" }, { a: "2", b: "3" }, { a: "1", b: "3" })).toEqual({ actions: [], conflicts: [] });
  });
  it("flags edit/edit and edit/delete as conflicts", () => {
    expect(planPull({ a: "1", b: "1" }, { a: "2", b: "5" }, { a: "3" }).conflicts).toEqual([
      { relPath: "a", local: "2", remote: "3" },
      { relPath: "b", local: "5", remote: null },
    ]);
  });
  it("with an empty base, overlapping different files conflict and remote-only files are written", () => {
    expect(planPull({}, { a: "1", k: "7" }, { a: "2", n: "3" })).toEqual({
      actions: [{ kind: "write", relPath: "n" }],
      conflicts: [{ relPath: "a", local: "1", remote: "2" }],
    });
  });
  it("resolvePull turns theirs into actions and mine into nothing; a missing choice throws", () => {
    const plan = planPull({ a: "1", b: "1" }, { a: "2", b: "2" }, { a: "3" });
    expect(resolvePull(plan, { a: "theirs", b: "theirs" }, { a: "3" })).toEqual([
      { kind: "write", relPath: "a" }, { kind: "delete", relPath: "b" },
    ]);
    expect(resolvePull(plan, { a: "mine", b: "mine" }, { a: "3" })).toEqual([]);
    let error: unknown;
    try {
      resolvePull(plan, { a: "mine" }, { a: "3" });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(GitSyncError);
    expect((error as GitSyncError).code).toBe("unresolved_conflicts");
    expect((error as GitSyncError).detail?.paths).toEqual(["b"]);
  });
  it("localChanges lists upserts and deletes", () => {
    expect(localChanges({ a: "1", b: "1", c: "1" }, { a: "1", b: "2", n: "3" })).toEqual({ upserts: ["b", "n"], deletes: ["c"] });
  });
  it("syncState", () => {
    expect([syncState(0, false), syncState(2, false), syncState(0, true), syncState(1, true)])
      .toEqual(["in_sync", "local", "remote", "diverged"]);
  });
});
