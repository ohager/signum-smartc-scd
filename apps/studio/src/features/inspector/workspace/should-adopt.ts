/**
 * Whether an open buffer takes text that was written to its file from
 * elsewhere. Only a clean buffer does: unsaved edits are the user's, and an
 * autosave of stale text would otherwise undo the other write.
 */
export function shouldAdopt(args: {
  fileId: string;
  eventFileId: string | undefined;
  isDirty: boolean;
  current: string;
  stored: unknown;
}): boolean {
  return (
    args.eventFileId === args.fileId &&
    !args.isDirty &&
    typeof args.stored === "string" &&
    args.stored !== args.current
  );
}
