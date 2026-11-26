import type { FileSystem } from "@/lib/file-system";
import { findProjectOfFolder } from "@/features/project/project-root";
import { contractOfProject } from "@/features/project/contract";
import { isTestEntry } from "./project-snapshot";
import type { RunState } from "./test-run-model";

/**
 * Passed/failed per test file, for the files a run was asked to cover.
 *
 * Counted from rows rather than `state.counts`: a run may span several files and
 * a verdict belongs to one. A timeout is a failure the user needs to see as one;
 * skipped and todo tests say nothing either way. A file that produced no rows
 * is still listed so it overwrites a stale verdict instead of leaving it
 * standing; collect and hook errors count as failures (see below).
 */
export function testVerdictsByFile(
  state: RunState,
  entryPaths: string[],
): Record<string, { passed: number; failed: number }> {
  const verdicts: Record<string, { passed: number; failed: number }> = {};
  for (const path of entryPaths) verdicts[path] = { passed: 0, failed: 0 };

  for (const row of state.rows) {
    const verdict = verdicts[row.file];
    if (!verdict) continue;
    if (row.status === "passed") verdict.passed++;
    else if (row.status === "failed" || row.status === "timedout") verdict.failed++;
  }

  /*
   * A file that could not be collected or whose hook threw has no rows to count,
   * yet it must not read as green (0 failed). An error naming an entry file fails
   * that file; one naming nothing we know (`(project)`, a harness failure such as
   * a transpile error) means no file's result can be trusted, so it fails them all.
   */
  for (const { file } of [...state.collectErrors, ...state.hookErrors]) {
    if (verdicts[file]) verdicts[file].failed++;
    else for (const verdict of Object.values(verdicts)) verdict.failed++;
  }
  return verdicts;
}

type VerdictFs = Pick<FileSystem, "listFolderContents" | "listFilesRecursive" | "status">;

/**
 * Files the verdicts where the rail reads them. Shared by the test editor and the
 * assistant's `run_tests`, so both write the same record the same way.
 *
 * `projectFolderId` may be a subfolder (see `project-root.ts`), hence the lookup.
 * Each verdict carries the modification times it was true for, so the rail can
 * tell when an edit has made it stale.
 *
 * Empty `entryPaths` means every test file in the project, the same convention
 * `latestRunAtom` uses for a run that was not narrowed to one file.
 */
export function recordTestVerdicts(
  fs: VerdictFs,
  projectFolderId: string,
  state: RunState,
  entryPaths: string[],
): void {
  const projectRoot = findProjectOfFolder(fs, projectFolderId);
  if (!projectRoot) return;

  const files = fs.listFilesRecursive(projectRoot);
  const contractModified = contractOfProject(files)?.contract.lastModified ?? 0;
  const byPath = new Map(files.map((file) => [file.path, file]));

  const covered = entryPaths.length ? entryPaths : files.map((f) => f.path).filter(isTestEntry);
  for (const [path, verdict] of Object.entries(testVerdictsByFile(state, covered))) {
    const file = byPath.get(path);
    if (!file) continue;
    fs.status.recordTests(projectRoot, file.id, {
      sourceModified: file.lastModified,
      contractModified,
      ...verdict,
    });
  }
}
