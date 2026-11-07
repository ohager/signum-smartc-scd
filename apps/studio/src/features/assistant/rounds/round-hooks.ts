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
 * The order is the safety property: flush before capture so the checkpoint is
 * current, capture before lock so a failed capture never leaves editors locked, and
 * on the way out unlock only after the end snapshot so the user cannot edit into a
 * half-recorded round. The tracker cannot undo a lock it never saw succeed, so a
 * failing `lock` is compensated here.
 */
export function createRoundHooks(deps: RoundHookDeps): RoundHooks {
  return {
    async start(projectId) {
      await deps.flush();
      const checkpoint = await deps.capture(projectId);
      try {
        deps.lock(projectId);
      } catch (err) {
        try {
          deps.unlock(projectId);
        } catch {
          // The lock failure is the root cause; do not mask it.
        }
        throw err;
      }
      const roundId = crypto.randomUUID();
      deps.notify.roundStarted({ projectId, roundId, checkpointId: checkpoint.id, at: Date.now() });
      return { roundId, checkpointId: checkpoint.id };
    },

    async end(projectId, roundId, reason) {
      await deps.endSnapshot(projectId, roundId);
      deps.unlock(projectId);
      deps.notify.roundEnded({ projectId, roundId, reason, at: Date.now() });
    },
  };
}
