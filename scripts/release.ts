#!/usr/bin/env bun
/**
 * Cuts a Studio release from `development`.
 *
 *   bun run release <version> [--publish]
 *
 * Write the CHANGELOG entry first (`## <version> — YYYY-MM-DD`): release notes
 * are written by a person, not generated. The script then checks that the
 * branch is development and even with origin, that nothing else is
 * uncommitted, that the version is new and greater, bumps
 * apps/studio/package.json and bun.lock, runs the tests and the build, and
 * commits and tags. Nothing leaves the machine unless --publish is given: then
 * development and the tag are pushed and main is fast-forwarded to
 * development, which deploys production.
 */

const PACKAGE = "apps/studio/package.json";
const CHANGELOG = "CHANGELOG.md";
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

export const isVersion = (v: string) => SEMVER.test(v);

/** Semver precedence: >0 when a is newer than b. */
export function compareVersions(a: string, b: string): number {
  const [, ...pa] = SEMVER.exec(a)!;
  const [, ...pb] = SEMVER.exec(b)!;
  for (let i = 0; i < 3; i++) {
    const d = Number(pa[i]) - Number(pb[i]);
    if (d) return d;
  }
  const [preA, preB] = [pa[3], pb[3]];
  if (!preA || !preB) return preA ? -1 : preB ? 1 : 0; // a release outranks its pre-releases
  const [ia, ib] = [preA.split("."), preB.split(".")];
  for (let i = 0; i < Math.max(ia.length, ib.length); i++) {
    if (ia[i] === undefined) return -1;
    if (ib[i] === undefined) return 1;
    const [na, nb] = [/^\d+$/.test(ia[i]) ? Number(ia[i]) : NaN, /^\d+$/.test(ib[i]) ? Number(ib[i]) : NaN];
    if (!isNaN(na) && !isNaN(nb)) {
      if (na !== nb) return na - nb;
    } else if (ia[i] !== ib[i]) {
      return isNaN(na) === isNaN(nb) ? (ia[i] < ib[i] ? -1 : 1) : isNaN(na) ? 1 : -1;
    }
  }
  return 0;
}

export function hasChangelogEntry(changelog: string, version: string): boolean {
  const escaped = version.replace(/[.+-]/g, "\\$&");
  return new RegExp(`^## ${escaped} — \\d{4}-\\d{2}-\\d{2}\\s*$`, "m").test(changelog);
}

/** Everything the release touches outside itself, so it can be tested. */
export interface Runner {
  /** Runs a shell command in the repo root; returns trimmed stdout, throws on failure. */
  run(cmd: string): string;
  read(path: string): string;
  write(path: string, content: string): void;
  print(line: string): void;
}

export async function release(
  { version, publish }: { version: string; publish: boolean },
  io: Runner,
): Promise<void> {
  const fail = (why: string): never => {
    throw new Error(why);
  };

  // 1. Checks — nothing is changed until all of them pass.
  if (!isVersion(version)) fail(`"${version}" is not a semver version (e.g. 0.2.0-alpha.1)`);
  const pkg = io.read(PACKAGE);
  const current = /"version":\s*"([^"]+)"/.exec(pkg)?.[1] ?? fail(`no version in ${PACKAGE}`);
  if (compareVersions(version, current) <= 0) fail(`${version} must be greater than the current ${current}`);
  if (io.run("git rev-parse --abbrev-ref HEAD") !== "development") fail("releases are cut from development");
  io.run("git fetch origin");
  if (io.run("git rev-parse HEAD") !== io.run("git rev-parse origin/development"))
    fail("development is not even with origin/development — pull or push first");
  const dirty = io.run("git status --porcelain").split("\n").filter(Boolean).filter((l) => !l.endsWith(CHANGELOG));
  if (dirty.length) fail(`uncommitted changes besides ${CHANGELOG}:\n${dirty.join("\n")}`);
  if (io.run(`git tag --list v${version}`)) fail(`tag v${version} already exists`);
  if (!hasChangelogEntry(io.read(CHANGELOG), version))
    fail(`${CHANGELOG} has no "## ${version} — YYYY-MM-DD" entry — write the release notes first`);

  // 2. Bump and verify; undo the bump if anything fails.
  io.print(`Releasing ${current} → ${version}`);
  io.write(PACKAGE, pkg.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`));
  try {
    io.run("bun install");
    io.run("bun test");
    io.run("bun run --cwd apps/studio build");
  } catch (error) {
    io.write(PACKAGE, pkg);
    io.run("git checkout -- bun.lock");
    throw error;
  }

  // 3. Commit and tag.
  io.run(`git add ${CHANGELOG} ${PACKAGE} bun.lock`);
  io.run(`git commit -m "chore(release): ${version}"`);
  io.run(`git tag -a v${version} -m "${version}"`);
  io.print(`Committed and tagged v${version}.`);

  // 4. Publish only on request: this deploys production.
  if (!publish) {
    io.print("Nothing pushed. To publish:");
    io.print(`  git push origin development && git push origin v${version} && git push origin development:main`);
    return;
  }
  io.run("git push origin development");
  io.run(`git push origin v${version}`);
  io.run("git push origin development:main"); // fast-forward only; refused if main diverged
  io.print(`Published v${version}: main now deploys it.`);
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const version = args.find((a) => !a.startsWith("--"));
  if (!version) {
    console.error("usage: bun run release <version> [--publish]");
    process.exit(1);
  }
  const root = new URL("..", import.meta.url).pathname;
  const io: Runner = {
    run(cmd) {
      const loud = /^(bun (install|test|run)|git push)/.test(cmd);
      const p = Bun.spawnSync(["sh", "-c", cmd], { cwd: root, stdout: loud ? "inherit" : "pipe", stderr: "inherit" });
      if (p.exitCode !== 0) throw new Error(`${cmd} failed (exit ${p.exitCode})`);
      return loud ? "" : p.stdout.toString().trim();
    },
    read: (path) => require("fs").readFileSync(root + path, "utf8"),
    write: (path, content) => require("fs").writeFileSync(root + path, content),
    print: (line) => console.log(line),
  };
  try {
    await release({ version, publish: args.includes("--publish") }, io);
  } catch (error) {
    console.error(`release: ${(error as Error).message}`);
    process.exit(1);
  }
}
