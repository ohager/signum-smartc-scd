import { useEffect, useState } from "react";
import { FileSystem } from "@/lib/file-system";
import type { SyncState } from "@/lib/git-sync/plan";
import { useGitSync, useRepoLink } from "./git-sync-context";
import { createStatusController, type RemoteCache } from "./status-controller";
import { createRemoteThrottle } from "./throttle";

export interface RepoStatus {
  state: SyncState;
  localChanges: number;
  remoteAhead: boolean | null;
}

const EVENTS = ["file:*", "folder:*", "fs:reloaded"] as const;
const REMOTE_INTERVAL_MS = 30_000;
const throttle = createRemoteThrottle(REMOTE_INTERVAL_MS, () => Date.now());
const remoteCache: RemoteCache = new Map();
const checked = new Map<string, string>();

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
    const ctl = createStatusController({
      projectId,
      baseCommit,
      // flush:false: a background badge must not cancel the editor's autosave debounce.
      fetch: (remote) => sync.status(projectId, { remote, flush: false }),
      throttle,
      cache: remoteCache,
      checked,
      onStatus: setStatus,
    });
    void ctl.start();
    const onFsEvent = () => ctl.scheduleLocal();
    const onFocus = () => void ctl.focus();
    const fs = FileSystem.getInstance();
    for (const ev of EVENTS) fs.addEventListener(ev, onFsEvent);
    window.addEventListener("focus", onFocus);
    return () => {
      ctl.dispose();
      for (const ev of EVENTS) fs.removeEventListener(ev, onFsEvent);
      window.removeEventListener("focus", onFocus);
    };
  }, [sync, projectId, baseCommit]);

  return baseCommit === null ? null : status;
}
