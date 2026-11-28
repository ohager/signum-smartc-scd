import { syncState } from "@/lib/git-sync/plan";
import type { RepoStatus } from "./use-repo-status";

export const LOCAL_DEBOUNCE_MS = 500;

/** Last known remote answer per project, valid for one base commit. */
export type RemoteCache = Map<string, { commit: string; ahead: boolean }>;

export interface StatusControllerDeps {
  projectId: string;
  baseCommit: string;
  fetch(remote: boolean): Promise<{ localChanges: number; remoteAhead: boolean | null }>;
  throttle: { shouldCheck(projectId: string): boolean };
  cache: RemoteCache;
  /** Base commit each project was last asked about on the remote. */
  checked: Map<string, string>;
  onStatus(status: RepoStatus): void;
}

/**
 * Decision logic of the status badge. Local and remote runs are independent: a local run never
 * invalidates a pending remote run, and a remote answer always lands in the cache.
 */
export function createStatusController(deps: StatusControllerDeps) {
  const { projectId, baseCommit, cache } = deps;
  let alive = true;
  let counter = 0;
  let latest = { seq: 0, count: 0, known: false };
  let timer: ReturnType<typeof setTimeout> | undefined;

  const cachedAhead = (): boolean | null => {
    const c = cache.get(projectId);
    return c && c.commit === baseCommit ? c.ahead : null;
  };

  const emit = () => {
    if (!alive || !latest.known) return;
    const remoteAhead = cachedAhead();
    deps.onStatus({
      state: syncState(latest.count, remoteAhead ?? false),
      localChanges: latest.count,
      remoteAhead,
    });
  };

  const run = async (remote: boolean) => {
    const seq = ++counter;
    if (remote) deps.checked.set(projectId, baseCommit);
    try {
      const res = await deps.fetch(remote);
      if (remote && res.remoteAhead !== null) cache.set(projectId, { commit: baseCommit, ahead: res.remoteAhead });
      if (seq > latest.seq) latest = { seq, count: res.localChanges, known: true };
      emit();
    } catch {
      // No link or unreadable files: keep the last status, never toast from a badge.
    }
  };

  return {
    /** Mount: the remote is asked when the base commit changed, otherwise only if the throttle allows. */
    start() {
      const changed = deps.checked.get(projectId) !== baseCommit;
      const allowed = deps.throttle.shouldCheck(projectId);
      return run(changed || allowed);
    },
    focus() {
      if (deps.throttle.shouldCheck(projectId)) return run(true);
    },
    /** Debounced local recompute for file system events. */
    scheduleLocal() {
      clearTimeout(timer);
      timer = setTimeout(() => void run(false), LOCAL_DEBOUNCE_MS);
    },
    dispose() {
      alive = false;
      clearTimeout(timer);
    },
  };
}
