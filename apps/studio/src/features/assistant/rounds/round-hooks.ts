import type { Checkpoint } from "./checkpoints";
import type { RoundHooks } from "./round-tracker";

export interface RoundHookDeps {
  /** Persists pending editor buffers so the checkpoint sees what the user sees. */
  flush: () => Promise<void>;
  capture: (projectId: string) => Promise<Checkpoint>;
  lock: (projectId: string) => void;
  unlock: (projectId: string) => void;
  endSnapshot: (projectId: string, roundId: string) => Promise<void>;
  notify: {
    roundStarted(e: { projectId: string; roundId: string; checkpointId: string; at: number }): void;
    roundEnded(e: { projectId: string; roundId: string; reason: "idle" | "takeover" | "disconnect"; at: number }): void;
  };
}

/*
 * The order is the safety property. Lock first, so from that moment the editors stop
 * saving into the project (a locked project's save is a no-op): an autosave that fired
 * after the checkpoint could otherwise overwrite the agent's first write. Then flush,
 * which persists the user's pending text, then capture, so the checkpoint is current.
 * Every step that fails after the lock unlocks again, so a failed start never leaves
 * editors locked; the tracker cannot undo a lock it never saw succeed. On the way out
 * unlock only after the end snapshot, so the user cannot edit into a half-recorded
 * round, but unlock even when the snapshot fails: the round is over for the tracker
 * either way.
 */
export function createRoundHooks(deps: RoundHookDeps): RoundHooks {
  const unlockQuietly = (projectId: string) => {
    try {
      deps.unlock(projectId);
    } catch {
      // The original failure is the root cause; do not mask it.
    }
  };
  return {
    async start(projectId) {
      let checkpoint: Checkpoint;
      try {
        deps.lock(projectId);
        await deps.flush();
        checkpoint = await deps.capture(projectId);
      } catch (err) {
        unlockQuietly(projectId);
        throw err;
      }
      const roundId = crypto.randomUUID();
      deps.notify.roundStarted({ projectId, roundId, checkpointId: checkpoint.id, at: Date.now() });
      return { roundId, checkpointId: checkpoint.id };
    },

    async end(projectId, roundId, reason) {
      try {
        await deps.endSnapshot(projectId, roundId);
      } finally {
        deps.unlock(projectId);
        deps.notify.roundEnded({ projectId, roundId, reason, at: Date.now() });
      }
    },
  };
}
