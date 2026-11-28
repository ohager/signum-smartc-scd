import { describe, expect, it } from "bun:test";
import { suggestCommitMessage } from "./commit-message";

describe("suggestCommitMessage", () => {
  it("suggests a message", () => {
    expect(suggestCommitMessage({ upserts: ["a.smart.c"], deletes: [] }, { "a.smart.c": "1" })).toBe(
      "Update a.smart.c\n\nM a.smart.c",
    );
    expect(
      suggestCommitMessage({ upserts: ["a.smart.c", "n.ts"], deletes: ["r.md"] }, { "a.smart.c": "1", "r.md": "2" }),
    ).toBe("Update 3 files\n\nM a.smart.c\nA n.ts\nD r.md");
  });

  it("keeps the first line within 72 characters", () => {
    const name = `${"x".repeat(100)}.ts`;
    const first = suggestCommitMessage({ upserts: [name], deletes: [] }, {}).split("\n")[0];
    expect(first.length).toBeLessThanOrEqual(72);
    expect(first.startsWith("Update xxx")).toBe(true);
  });
});
