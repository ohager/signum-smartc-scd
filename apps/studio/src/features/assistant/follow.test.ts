import { describe, it, expect } from "bun:test";
import { readyToReveal, decideFollow, isFollowable, nextBaseline, emptyBaselineState, type BaselineState } from "./follow";
import type { CheckpointFile } from "./rounds/checkpoints";

const files = (tag: string): CheckpointFile[] => [{ relPath: `${tag}.c`, type: "smartc", content: tag }];
const touched = { fileId: "f1", projectId: "p1", type: "smartc" };

describe("decideFollow", () => {
  it("dots when follow mode is off", () => {
    expect(decideFollow({ followMode: false, currentProjectId: "p1", touched })).toBe("dot");
  });
  it("dots when the user is in another project or none", () => {
    expect(decideFollow({ followMode: true, currentProjectId: "p2", touched })).toBe("dot");
    expect(decideFollow({ followMode: true, currentProjectId: null, touched })).toBe("dot");
  });
  it("opens when follow mode is on and the user is in that project", () => {
    expect(decideFollow({ followMode: true, currentProjectId: "p1", touched })).toBe("open");
  });
});

describe("decideFollow by file type", () => {
  it("dots a Doc file in the user's project, since files-page has no editor for it", () => {
    expect(decideFollow({ followMode: true, currentProjectId: "p1", touched: { ...touched, type: "doc" } })).toBe("dot");
  });
  it("opens a SmartC file in the user's project", () => {
    expect(decideFollow({ followMode: true, currentProjectId: "p1", touched: { ...touched, type: "smartc" } })).toBe("open");
  });
});

describe("isFollowable", () => {
  it("is true for every type files-page renders an editor for and false otherwise", () => {
    for (const t of ["smartc", "asm", "scenario", "test", "inspect", "labels"]) expect(isFollowable(t)).toBe(true);
    for (const t of ["doc", "unknown", ""]) expect(isFollowable(t)).toBe(false);
  });
});

describe("nextBaseline", () => {
  const start = (s: BaselineState, projectId: string, tag: string) => nextBaseline(s, { type: "roundStarted", projectId, files: files(tag) });
  const end = (s: BaselineState, projectId: string, tag: string) => nextBaseline(s, { type: "roundEnded", projectId, files: files(tag) });

  it("uses the running round's checkpoint while no round of the project has ended", () => {
    const s = start(emptyBaselineState, "p1", "r1");
    expect(s.baseline.p1).toEqual(files("r1"));
  });

  it("keeps the last ended round's checkpoint while the next round runs", () => {
    let s = start(emptyBaselineState, "p1", "r1");
    s = end(s, "p1", "r1");
    s = start(s, "p1", "r2");
    expect(s.baseline.p1).toEqual(files("r1"));
  });

  it("switches only when the next round ends", () => {
    let s = start(emptyBaselineState, "p1", "r1");
    s = end(s, "p1", "r1");
    s = start(s, "p1", "r2");
    s = end(s, "p1", "r2");
    expect(s.baseline.p1).toEqual(files("r2"));
  });

  it("keeps projects independent", () => {
    let s = start(emptyBaselineState, "p1", "a");
    s = start(s, "p2", "b");
    s = end(s, "p1", "a");
    expect(s.baseline).toEqual({ p1: files("a"), p2: files("b") });
  });

  it("does not mutate the previous state", () => {
    const s0 = start(emptyBaselineState, "p1", "r1");
    end(s0, "p1", "r1");
    expect(s0.settled.has("p1")).toBe(false);
  });
});

describe("missing checkpoints", () => {
  it("leaves the baseline alone on a start and removes it on an end", () => {
    let s = nextBaseline(emptyBaselineState, { type: "roundStarted", projectId: "p1", files: files("r1") });
    s = nextBaseline(s, { type: "roundStarted", projectId: "p1", files: null });
    expect(s.baseline.p1).toEqual(files("r1"));
    s = nextBaseline(s, { type: "roundEnded", projectId: "p1", files: null });
    expect(s.baseline.p1).toBeUndefined();
  });
});

describe("readyToReveal", () => {
  it("is ready without an expectation or when the text matches (EOL-insensitive)", () => {
    expect(readyToReveal("old", undefined)).toBe(true);
    expect(readyToReveal("a\r\nb", "a\nb")).toBe(true);
    expect(readyToReveal("old", "new")).toBe(false);
  });
});
