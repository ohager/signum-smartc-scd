/**
 * What the workflow rail reports, persisted.
 *
 * Two facts about a project cannot be recomputed on demand: whether its
 * contract compiled, and how its last test run went. Both are records of
 * something that happened, so both carry the `lastModified` of the source they
 * came from — a verdict from before the last edit must not be shown, and the
 * timestamps are what make that possible rather than merely likely.
 *
 * Deployment is deliberately absent: the chain answers that from the code
 * hash, so there is nothing to keep and nothing to go stale.
 *
 * Same shape of service as `RecentFiles`, and composed into `FileSystem` the
 * same way — except that its writes are announced, because the rail reads them
 * on a different surface from the one that wrote them.
 */

export interface CompileVerdict {
  /** The contract file's `lastModified` when this verdict was produced. */
  sourceModified: number;
  errorCount: number;
}

export interface TestVerdict {
  /** The test file's `lastModified` when the run happened. */
  sourceModified: number;
  /** And the contract's — a test result depends on both files. */
  contractModified: number;
  passed: number;
  failed: number;
}

export interface ProjectStatusRecord {
  compile?: CompileVerdict;
  /** Keyed by test file id. */
  tests: Record<string, TestVerdict>;
}

export type ProjectStatusMap = Record<string, ProjectStatusRecord>;

/** The slice of `FileSystem` this service needs. */
export interface ProjectStatusHost {
  getStatuses(): ProjectStatusMap;
  /** Replaces the map and persists it. */
  setStatuses(statuses: ProjectStatusMap): void;
}

const EMPTY: ProjectStatusRecord = { tests: {} };

function isRecordShaped(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Hydration guard for the persisted field.
 *
 * Runs while `FileSystem` is being constructed, so it must never throw: a
 * corrupt status field cannot be allowed to take down the workspace it
 * describes.
 */
export function sanitizeStatuses(value: unknown): ProjectStatusMap {
  if (!isRecordShaped(value)) return {};

  const clean: ProjectStatusMap = {};
  for (const [projectId, record] of Object.entries(value as Record<string, unknown>)) {
    if (!isRecordShaped(record)) continue;
    const candidate = record as ProjectStatusRecord;
    clean[projectId] = {
      compile: isRecordShaped(candidate.compile) ? candidate.compile : undefined,
      tests: isRecordShaped(candidate.tests) ? candidate.tests : {},
    };
  }

  return clean;
}

export class ProjectStatus {
  constructor(private readonly host: ProjectStatusHost) {}

  /** Never null: a project nobody has run anything in simply has no facts. */
  of(projectId: string): ProjectStatusRecord {
    return this.host.getStatuses()[projectId] ?? EMPTY;
  }

  recordCompile(projectId: string, verdict: CompileVerdict): void {
    const statuses = this.host.getStatuses();
    const current = statuses[projectId] ?? EMPTY;
    this.host.setStatuses({
      ...statuses,
      [projectId]: { ...current, compile: verdict },
    });
  }

  recordTests(projectId: string, testFileId: string, verdict: TestVerdict): void {
    const statuses = this.host.getStatuses();
    const current = statuses[projectId] ?? EMPTY;
    this.host.setStatuses({
      ...statuses,
      [projectId]: {
        ...current,
        tests: { ...current.tests, [testFileId]: verdict },
      },
    });
  }

  /** Called by the file system when a project folder is deleted. */
  forgetProject(projectId: string): void {
    const statuses = this.host.getStatuses();
    if (!(projectId in statuses)) return;
    const { [projectId]: _gone, ...rest } = statuses;
    this.host.setStatuses(rest);
  }

  /** Called by the file system when any file is deleted. */
  forgetTests(testFileId: string): void {
    const statuses = this.host.getStatuses();
    let changed = false;
    const next: ProjectStatusMap = {};

    for (const [projectId, record] of Object.entries(statuses)) {
      if (testFileId in record.tests) {
        const { [testFileId]: _gone, ...tests } = record.tests;
        next[projectId] = { ...record, tests };
        changed = true;
      } else {
        next[projectId] = record;
      }
    }

    if (changed) this.host.setStatuses(next);
  }
}
