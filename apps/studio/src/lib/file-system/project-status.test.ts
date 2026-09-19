import { describe, it, expect } from "bun:test";
import {
  ProjectStatus,
  sanitizeStatuses,
  type ProjectStatusMap,
} from "./project-status";

function hostOver(initial: ProjectStatusMap = {}) {
  let stored = initial;
  return {
    host: {
      getStatuses: () => stored,
      setStatuses: (next: ProjectStatusMap) => {
        stored = next;
      },
    },
    read: () => stored,
  };
}

describe("sanitizeStatuses", () => {
  it("returns an empty map for anything unreadable", () => {
    // Runs while FileSystem is being constructed, so it must never throw.
    expect(sanitizeStatuses(undefined)).toEqual({});
    expect(sanitizeStatuses("nonsense")).toEqual({});
    expect(sanitizeStatuses([1, 2])).toEqual({});
  });

  it("drops entries that are not shaped like a record", () => {
    expect(sanitizeStatuses({ p1: 7, p2: { tests: {} } })).toEqual({
      p2: { tests: {} },
    });
  });

  it("repairs a record whose tests map is missing", () => {
    expect(sanitizeStatuses({ p1: { compile: { sourceModified: 1, errorCount: 0 } } })).toEqual({
      p1: { compile: { sourceModified: 1, errorCount: 0 }, tests: {} },
    });
  });
});

describe("ProjectStatus", () => {
  it("remembers a compile verdict per project", () => {
    const { host, read } = hostOver();
    const status = new ProjectStatus(host);

    status.recordCompile("proj", { sourceModified: 100, errorCount: 0 });

    expect(status.of("proj").compile).toEqual({ sourceModified: 100, errorCount: 0 });
    expect(read().proj!.compile!.errorCount).toBe(0);
  });

  it("keeps one test verdict per test file", () => {
    const { host } = hostOver();
    const status = new ProjectStatus(host);

    status.recordTests("proj", "t1", {
      sourceModified: 10,
      contractModified: 5,
      passed: 12,
      failed: 0,
    });
    status.recordTests("proj", "t2", {
      sourceModified: 11,
      contractModified: 5,
      passed: 3,
      failed: 1,
    });

    expect(status.of("proj").tests.t1!.passed).toBe(12);
    expect(status.of("proj").tests.t2!.failed).toBe(1);
  });

  it("answers with an empty record for a project it has never seen", () => {
    const status = new ProjectStatus(hostOver().host);
    expect(status.of("unknown")).toEqual({ tests: {} });
  });

  it("forgets a project entirely, so a deleted project leaves nothing behind", () => {
    const { host, read } = hostOver();
    const status = new ProjectStatus(host);
    status.recordCompile("proj", { sourceModified: 1, errorCount: 0 });

    status.forgetProject("proj");

    expect(read()).toEqual({});
  });

  it("forgets a single test file's verdict when that file is deleted", () => {
    const { host } = hostOver();
    const status = new ProjectStatus(host);
    status.recordTests("proj", "t1", {
      sourceModified: 1,
      contractModified: 1,
      passed: 1,
      failed: 0,
    });

    status.forgetTests("t1");

    expect(status.of("proj").tests.t1).toBeUndefined();
  });
});
