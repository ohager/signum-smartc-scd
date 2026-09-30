import { describe, expect, it } from "bun:test";
import { createLatest } from "./latest";

describe("createLatest", () => {
  it("marks a response stale once a newer request started", async () => {
    const latest = createLatest();
    let releaseFirst!: (v: string) => void;
    const first = latest(new Promise<string>((r) => (releaseFirst = r)));
    const second = latest(Promise.resolve("new"));
    releaseFirst("old");
    expect(await second).toEqual({ current: true, value: "new" });
    expect(await first).toEqual({ current: false, value: "old" });
  });
});
