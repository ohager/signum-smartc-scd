import { restoreWithUndo, userChangesSince, type Checkpoint, type CheckpointFile, type CheckpointStore } from "../rounds/checkpoints";
import type { Clock } from "../rounds/round-tracker";
import type { WorkspaceFs } from "../tools/paths";

export interface RestoreDeps {
  fs: WorkspaceFs;
  store: CheckpointStore;
  clock: Clock;
  checkpointOf(roundId: string): { projectId: string; checkpointId: string } | undefined;
  endSnapshotOf(roundId: string): CheckpointFile[] | undefined;
  /** Whether an agent round is live on the project, whichever round that is. */
  hasActiveRound(projectId: string): boolean;
  takeOver(projectId: string): Promise<unknown>;
  /** Makes the agent's next write on the project fail with `user_took_over`. */
  markTookOver(projectId: string): void;
}

export interface RestorePlan {
  /** Files the user changed after the round; empty means a plain confirmation. */
  needsConfirm: string[];
  confirm(): Promise<{ undoCheckpointId: string }>;
}

/*
 * Two steps so the UI can ask before anything is written. A live round is taken over
 * first: that ends it, which captures the end snapshot the user-change check needs and
 * unlocks the editors, so the restore never races the agent. The confirm dialog can stay
 * open for a long time, so `confirm()` checks again: the agent may have started a new
 * round meanwhile.
 */
export async function restoreRound(deps: RestoreDeps, roundId: string): Promise<RestorePlan> {
  const round = deps.checkpointOf(roundId);
  if (!round) throw new Error(`Unknown round ${roundId}`);
  /*
   * Any live round of the project, not only this one: restoring an older round while a
   * newer one runs would otherwise write underneath the agent.
   */
  if (deps.hasActiveRound(round.projectId)) await deps.takeOver(round.projectId);
  const endSnapshot = deps.endSnapshotOf(roundId);
  if (!endSnapshot) throw new Error(`Round ${roundId} has no end snapshot`);
  const target = await deps.store.get(round.checkpointId);
  if (!target) throw new Error(`Checkpoint ${round.checkpointId} is gone`);

  const needsConfirm = await userChangesSince(deps.fs, round.projectId, endSnapshot);
  return {
    needsConfirm,
    confirm: () => rewriteProject(deps, round.projectId, target),
  };
}

type RewriteDeps = Pick<RestoreDeps, "fs" | "store" | "clock" | "hasActiveRound" | "takeOver" | "markTookOver">;

/*
 * Shared by restore and undo: never write underneath a live round, always leave a
 * `before-restore` checkpoint, and afterwards make the agent re-read, since the files it
 * last saw are gone.
 */
async function rewriteProject(deps: RewriteDeps, projectId: string, target: Checkpoint): Promise<{ undoCheckpointId: string }> {
  if (deps.hasActiveRound(projectId)) await deps.takeOver(projectId);
  const result = await restoreWithUndo({ fs: deps.fs, store: deps.store, clock: deps.clock }, projectId, target);
  deps.markTookOver(projectId);
  return result;
}

/*
 * Puts the project back as it was right before a restore; the undo checkpoint is not
 * consumed. The undo takes its own checkpoint first, so it can be undone in turn.
 */
export async function undoRestore(deps: RewriteDeps, undoCheckpointId: string): Promise<{ undoCheckpointId: string }> {
  const cp = await deps.store.get(undoCheckpointId);
  if (!cp) throw new Error(`Checkpoint ${undoCheckpointId} is gone`);
  return rewriteProject(deps, cp.projectId, cp);
}

function asText(content: unknown): string {
  return typeof content === "string" ? content : JSON.stringify(content, null, 2);
}

/*
 * Current content is looked up by path, not file id: a restore recreates files with new
 * ids, and an id from the feed would wrongly look deleted afterwards.
 */
export async function loadRoundDiff(
  deps: Pick<RestoreDeps, "fs" | "store">,
  checkpointId: string,
  projectId: string,
  relPath: string,
): Promise<{ original: string; modified: string; deleted: boolean }> {
  const cp = await deps.store.get(checkpointId);
  const before = cp?.files.find((f) => f.relPath === relPath);
  const fileId = deps.fs.getFileIdByPath(`${deps.fs.getFolder(projectId).path}/${relPath}`);
  const current = fileId ? (await deps.fs.loadFile<unknown>(fileId)).content : undefined;
  return {
    original: before ? asText(before.content) : "",
    modified: fileId ? asText(current) : "",
    deleted: !fileId,
  };
}
