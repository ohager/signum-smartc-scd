/**
 * Whether an open buffer takes text that was written to its file from
 * elsewhere. Normally only a clean buffer does: unsaved edits are the user's,
 * and an autosave of stale text would otherwise undo the other write.
 *
 * A locked project is the exception. The lock means an AI Assistant round
 * owns the project, and the round started by flushing every pending save
 * after locking, so the user's text is already in storage and in the round's
 * checkpoint. Keeping a dirty buffer then would only show stale text over the
 * agent's write; saving it is blocked anyway (see `writesBack`).
 */
export function shouldAdopt(args: {
  fileId: string;
  eventFileId: string | undefined;
  isDirty: boolean;
  locked: boolean;
  current: string;
  stored: unknown;
}): boolean {
  return (
    args.eventFileId === args.fileId &&
    (!args.isDirty || args.locked) &&
    typeof args.stored === "string" &&
    args.stored !== args.current
  );
}

/**
 * Whether a save may write the buffer to storage. Not into a locked project:
 * an autosave timer that fires after the round's checkpoint would overwrite the
 * agent's write. The one exception is the round-start flush itself, which runs
 * after the lock precisely so nothing slips in between it and the checkpoint.
 */
export function writesBack(args: { locked: boolean; flushing: boolean }): boolean {
  return !args.locked || args.flushing;
}

/**
 * The events after which an open buffer re-reads its file. Another tab's
 * write does not arrive as `file:updated` — that tab replaces the whole
 * workspace, and this one hears `fs:reloaded`.
 */
export function reloadsOn(type: string, detail: { id?: string } | undefined, fileId: string): boolean {
  if (type === "fs:reloaded") return true;
  return type === "file:updated" && detail?.id === fileId;
}
