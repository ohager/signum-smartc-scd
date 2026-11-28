import { useEffect, useState } from "react";
import { FileSystem } from "@/lib/file-system";
import { syncState, type SyncState } from "@/lib/git-sync/plan";
import { useGitSync, useRepoLink } from "./git-sync-context";
import { createRemoteThrottle } from "./throttle";

export interface RepoStatus {
  state: SyncState;
  localChanges: number;
  remoteAhead: boolean | null;
}

const EVENTS = ["file:*", "folder:*", "fs:reloaded"] as const;
const REMOTE_INTERVAL_MS = 30_000;
const LOCAL_DEBOUNCE_MS = 500;
const throttle = createRemoteThrottle(REMOTE_INTERVAL_MS, () => Date.now());
/** Last known remote result per project, valid for one base commit; shared by every badge. */
const remoteCache = new Map<string, { commit: string; ahead: boolean }>();

/** Sync status of a project; null when it is not linked. */
export function useRepoStatus(projectId: string): RepoStatus | null {
  const { sync } = useGitSync();
  const link = useRepoLink(projectId);
  const baseCommit = link?.baseCommit ?? null;
  const [status, setStatus] = useState<RepoStatus | null>(null);

  useEffect(() => {
    if (baseCommit === null) {
      setStatus(null);
      return;
    }
    let alive = true;
    let seq = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cached = () => {
      const c = remoteCache.get(projectId);
      return c && c.commit === baseCommit ? c.ahead : null;
    };

    const run = async (remote: boolean) => {
      const mine = ++seq;
      try {
        const res = await sync.status(projectId, { remote });
        if (!alive || mine !== seq) return;
        let remoteAhead = res.remoteAhead;
        if (remote && remoteAhead !== null) remoteCache.set(projectId, { commit: baseCommit, ahead: remoteAhead });
        else remoteAhead = cached();
        setStatus({
          state: syncState(res.localChanges, remoteAhead ?? false),
          localChanges: res.localChanges,
          remoteAhead,
        });
      } catch {
        // No link or unreadable files: keep the last status, never toast from a badge.
      }
    };

    // A new base commit (link, pull, push) invalidates the old remote answer: ask again.
    throttle.shouldCheck(projectId);
    void run(true);

    const onFsEvent = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void run(false), LOCAL_DEBOUNCE_MS);
    };
    const onFocus = () => {
      if (throttle.shouldCheck(projectId)) void run(true);
    };

    const fs = FileSystem.getInstance();
    for (const ev of EVENTS) fs.addEventListener(ev, onFsEvent);
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      clearTimeout(timer);
      for (const ev of EVENTS) fs.removeEventListener(ev, onFsEvent);
      window.removeEventListener("focus", onFocus);
    };
  }, [sync, projectId, baseCommit]);

  return baseCommit === null ? null : status;
}
