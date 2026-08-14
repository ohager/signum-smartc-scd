import { describe, it, expect } from "bun:test";
import {
  addRecent,
  pruneRecents,
  sanitizeRecents,
  RecentFiles,
  RECENTS_LIMIT,
  type RecentEntry,
  type RecentsHost,
} from "./recent-files";

/** In-memory `RecentsHost`, same fake-host style as `transfer.test.ts`. */
function fakeHost(seed: RecentEntry[] = [], existingFiles: string[] = []) {
  let stored: RecentEntry[] = [...seed];
  const files = new Set(existingFiles);
  const host: RecentsHost = {
    getRecents: () => stored,
    setRecents: (recents) => {
      stored = recents;
    },
    exists: (fileId) => files.has(fileId),
  };
  return { host, read: () => stored };
}

describe("sanitizeRecents", () => {
  it("returns an empty list for absent data", () => {
    expect(sanitizeRecents(undefined)).toEqual([]);
  });

  it("returns an empty list when the value is not an array", () => {
    expect(sanitizeRecents({ fileId: "a", openedAt: 1 })).toEqual([]);
  });

  it("drops malformed entries but keeps valid ones", () => {
    const value = [
      { fileId: "a", openedAt: 2 },
      { fileId: "", openedAt: 3 },
      { fileId: "b" },
      null,
      "nope",
      { fileId: "c", openedAt: 1 },
    ];
    expect(sanitizeRecents(value)).toEqual([
      { fileId: "a", openedAt: 2 },
      { fileId: "c", openedAt: 1 },
    ]);
  });

  it("caps an oversized list at RECENTS_LIMIT", () => {
    const value = Array.from({ length: 20 }, (_, i) => ({ fileId: `f${i}`, openedAt: i }));
    expect(sanitizeRecents(value)).toHaveLength(RECENTS_LIMIT);
  });
});

describe("addRecent", () => {
  it("puts a newly opened file at the front", () => {
    const after = addRecent([{ fileId: "a", openedAt: 1 }], "b", 2);
    expect(after.map((e) => e.fileId)).toEqual(["b", "a"]);
  });

  it("moves an already-present file to the front without duplicating it", () => {
    const start = [
      { fileId: "b", openedAt: 2 },
      { fileId: "a", openedAt: 1 },
    ];
    const after = addRecent(start, "a", 3);
    expect(after.map((e) => e.fileId)).toEqual(["a", "b"]);
    expect(after[0]).toEqual({ fileId: "a", openedAt: 3 });
  });

  it("caps at RECENTS_LIMIT, dropping the oldest", () => {
    let recents: RecentEntry[] = [];
    for (let i = 0; i < RECENTS_LIMIT + 3; i++) recents = addRecent(recents, `f${i}`, i);
    expect(recents).toHaveLength(RECENTS_LIMIT);
    expect(recents[0].fileId).toBe(`f${RECENTS_LIMIT + 2}`);
    expect(recents.map((e) => e.fileId)).not.toContain("f0");
  });

  it("does not mutate the input", () => {
    const start = [{ fileId: "a", openedAt: 1 }];
    addRecent(start, "b", 2);
    expect(start).toEqual([{ fileId: "a", openedAt: 1 }]);
  });
});

describe("pruneRecents", () => {
  it("drops entries whose file no longer exists", () => {
    const recents = [
      { fileId: "gone", openedAt: 3 },
      { fileId: "here", openedAt: 2 },
    ];
    expect(pruneRecents(recents, (id) => id === "here")).toEqual([
      { fileId: "here", openedAt: 2 },
    ]);
  });

  it("returns an empty list when nothing survives", () => {
    expect(pruneRecents([{ fileId: "gone", openedAt: 1 }], () => false)).toEqual([]);
  });
});

describe("RecentFiles", () => {
  it("lists stored entries that still exist, newest first", () => {
    const { host } = fakeHost(
      [
        { fileId: "b", openedAt: 2 },
        { fileId: "a", openedAt: 1 },
      ],
      ["a", "b"],
    );
    expect(new RecentFiles(host).list().map((e) => e.fileId)).toEqual(["b", "a"]);
  });

  it("self-heals: listing writes back the pruned buffer", () => {
    const { host, read } = fakeHost(
      [
        { fileId: "gone", openedAt: 2 },
        { fileId: "a", openedAt: 1 },
      ],
      ["a"],
    );
    expect(new RecentFiles(host).list().map((e) => e.fileId)).toEqual(["a"]);
    expect(read().map((e) => e.fileId)).toEqual(["a"]);
  });

  it("does not write when nothing needs pruning", () => {
    let writes = 0;
    let stored: RecentEntry[] = [{ fileId: "a", openedAt: 1 }];
    const host: RecentsHost = {
      getRecents: () => stored,
      setRecents: (recents) => {
        writes++;
        stored = recents;
      },
      exists: () => true,
    };
    new RecentFiles(host).list();
    expect(writes).toBe(0);
  });

  it("records an open through the host", () => {
    const { host, read } = fakeHost([], ["a"]);
    new RecentFiles(host).record("a", 5);
    expect(read()).toEqual([{ fileId: "a", openedAt: 5 }]);
  });

  it("forgets a single entry, leaving the others", () => {
    const { host, read } = fakeHost(
      [
        { fileId: "a", openedAt: 2 },
        { fileId: "b", openedAt: 1 },
      ],
      ["a", "b"],
    );
    new RecentFiles(host).forget("a");
    expect(read().map((e) => e.fileId)).toEqual(["b"]);
  });

  it("does not write when forgetting an entry it never had", () => {
    let writes = 0;
    let stored: RecentEntry[] = [{ fileId: "a", openedAt: 1 }];
    const host: RecentsHost = {
      getRecents: () => stored,
      setRecents: (recents) => {
        writes++;
        stored = recents;
      },
      exists: () => true,
    };
    new RecentFiles(host).forget("never-there");
    expect(writes).toBe(0);
  });
});
