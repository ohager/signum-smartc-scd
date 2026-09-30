import { describe, expect, it } from "bun:test";
import { compareVersions, hasChangelogEntry, isVersion, release, type Runner } from "./release";

describe("versions", () => {
  it("accepts semver with an optional pre-release", () => {
    expect(isVersion("0.2.0-alpha.1")).toBe(true);
    expect(isVersion("1.0.0")).toBe(true);
    expect(isVersion("v1.0.0")).toBe(false);
    expect(isVersion("1.0")).toBe(false);
  });

  it("orders by semver precedence", () => {
    expect(compareVersions("0.2.0-alpha.1", "0.1.0-alpha.1")).toBeGreaterThan(0);
    expect(compareVersions("0.1.0-alpha.2", "0.1.0-alpha.1")).toBeGreaterThan(0);
    expect(compareVersions("0.1.0-alpha.10", "0.1.0-alpha.9")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "1.0.0-rc.1")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0-beta", "1.0.0-alpha")).toBeGreaterThan(0);
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
  });
});

describe("changelog", () => {
  it("needs a heading for exactly this version, with a date", () => {
    const log = "# Changelog\n\n## 0.2.0-alpha.1 — 2026-09-30\n\nNotes\n";
    expect(hasChangelogEntry(log, "0.2.0-alpha.1")).toBe(true);
    expect(hasChangelogEntry(log, "0.2.0-alpha")).toBe(false);
    expect(hasChangelogEntry("## 0.2.0-alpha.1\n", "0.2.0-alpha.1")).toBe(false);
  });
});

/** A fake world: git answers, files, and a log of every command run. */
function world(over: Partial<Record<string, string>> = {}, failOn?: string) {
  const files: Record<string, string> = {
    "CHANGELOG.md": "# Changelog\n\n## 0.2.0-alpha.1 — 2026-09-30\n\n- things\n",
    "apps/studio/package.json": '{\n  "name": "@x/studio",\n  "version": "0.1.0-alpha.1"\n}\n',
  };
  const answers: Record<string, string> = {
    "git rev-parse --abbrev-ref HEAD": "development",
    "git rev-parse HEAD": "abc",
    "git rev-parse origin/development": "abc",
    "git status --porcelain": " M CHANGELOG.md",
    "git tag --list v0.2.0-alpha.1": "",
    ...over,
  };
  const log: string[] = [];
  const runner: Runner = {
    run(cmd) {
      log.push(cmd);
      if (failOn && cmd.startsWith(failOn)) throw new Error(`${cmd} failed`);
      return answers[cmd] ?? "";
    },
    read: (p) => files[p],
    write: (p, content) => {
      files[p] = content;
    },
    print: () => {},
  };
  return { runner, log, files };
}

describe("release", () => {
  it("bumps, verifies, commits and tags — and pushes nothing without --publish", async () => {
    const w = world();
    await release({ version: "0.2.0-alpha.1", publish: false }, w.runner);
    expect(w.files["apps/studio/package.json"]).toContain('"version": "0.2.0-alpha.1"');
    expect(w.log).toContain("bun install");
    expect(w.log).toContain("bun test");
    expect(w.log).toContain("bun run --cwd apps/studio build");
    expect(w.log).toContain("git add CHANGELOG.md apps/studio/package.json bun.lock");
    expect(w.log).toContain('git commit -m "chore(release): 0.2.0-alpha.1"');
    expect(w.log).toContain('git tag -a v0.2.0-alpha.1 -m "0.2.0-alpha.1"');
    expect(w.log.some((c) => c.startsWith("git push"))).toBe(false);
  });

  it("with --publish pushes development, the tag, then fast-forwards main", async () => {
    const w = world();
    await release({ version: "0.2.0-alpha.1", publish: true }, w.runner);
    const pushes = w.log.filter((c) => c.startsWith("git push"));
    expect(pushes).toEqual([
      "git push origin development",
      "git push origin v0.2.0-alpha.1",
      "git push origin development:main",
    ]);
  });

  const refuses = async (w: ReturnType<typeof world>, version: string, message: RegExp) => {
    await expect(release({ version, publish: true }, w.runner)).rejects.toThrow(message);
    expect(w.log.some((c) => c.startsWith("git commit") || c.startsWith("git push"))).toBe(false);
  };

  it("refuses an invalid or non-increasing version", async () => {
    await refuses(world(), "v0.2", /not a semver/);
    await refuses(world({ "git tag --list v0.1.0-alpha.1": "" }), "0.1.0-alpha.1", /must be greater/);
  });

  it("refuses to run off development, behind origin, or with other changes", async () => {
    await refuses(world({ "git rev-parse --abbrev-ref HEAD": "main" }), "0.2.0-alpha.1", /development/);
    await refuses(world({ "git rev-parse origin/development": "def" }), "0.2.0-alpha.1", /origin\/development/);
    await refuses(world({ "git status --porcelain": " M CHANGELOG.md\n M apps/studio/src/x.ts" }), "0.2.0-alpha.1", /uncommitted/);
  });

  it("refuses an existing tag or a missing changelog entry", async () => {
    await refuses(world({ "git tag --list v0.2.0-alpha.1": "v0.2.0-alpha.1" }), "0.2.0-alpha.1", /already exists/);
    const w = world();
    w.files["CHANGELOG.md"] = "# Changelog\n";
    await refuses(w, "0.2.0-alpha.1", /CHANGELOG/);
  });

  it("restores the version and lockfile when tests fail", async () => {
    const w = world({}, "bun test");
    await expect(release({ version: "0.2.0-alpha.1", publish: false }, w.runner)).rejects.toThrow(/bun test failed/);
    expect(w.files["apps/studio/package.json"]).toContain('"version": "0.1.0-alpha.1"');
    expect(w.log).toContain("git checkout -- bun.lock");
    expect(w.log.some((c) => c.startsWith("git commit"))).toBe(false);
  });
});
