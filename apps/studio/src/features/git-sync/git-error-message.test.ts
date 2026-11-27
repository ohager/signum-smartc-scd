import { describe, expect, it } from "bun:test";
import { GitSyncError, type GitSyncErrorCode } from "@/lib/git-sync/errors";
import { gitErrorMessage } from "./git-error-message";

const CODES: GitSyncErrorCode[] = [
  "no_token", "auth", "forbidden", "rate_limited", "not_found", "not_fast_forward", "truncated", "no_marker",
  "nested_markers", "format_unsupported", "invalid_marker", "locked", "stale", "nothing_to_push",
  "multiple_contracts", "path_taken", "network",
];

describe("gitErrorMessage", () => {
  it("has a translated text for every code", () => {
    for (const code of CODES) {
      const text = gitErrorMessage(new GitSyncError(code, "raw"));
      expect(text).not.toBe("raw");
      expect(text).not.toContain("project.git.errors");
      expect(text.length).toBeGreaterThan(0);
    }
  });

  it("includes the reset time and the taken paths", () => {
    const resetAt = Date.UTC(2026, 0, 1, 12, 0, 0);
    expect(gitErrorMessage(new GitSyncError("rate_limited", "x", { resetAt }))).toContain(
      new Date(resetAt).toLocaleTimeString(),
    );
    expect(gitErrorMessage(new GitSyncError("path_taken", "x", { paths: ["a.ts", "b/c.ts"] }))).toContain("a.ts, b/c.ts");
  });

  it("falls back to the message of other errors", () => {
    expect(gitErrorMessage(new Error("Unknown undo token."))).toBe("Unknown undo token.");
  });
});
