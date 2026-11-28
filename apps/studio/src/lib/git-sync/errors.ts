export type GitSyncErrorCode =
  | "no_token"
  | "auth"
  | "forbidden"
  | "rate_limited"
  | "not_found"
  | "not_fast_forward"
  | "truncated"
  | "no_marker"
  | "nested_markers"
  | "format_unsupported"
  | "invalid_marker"
  | "locked"
  | "stale"
  | "nothing_to_push"
  | "multiple_contracts"
  | "path_taken"
  /** `initialize`: a file on GitHub sits at the folder or at a parent of it (`detail.paths`). */
  | "folder_taken"
  /** A folder path that is not a normalized relative repo path. */
  | "invalid_folder"
  | "marker_changed"
  | "undo_expired"
  | "unresolved_conflicts"
  /** No answer from GitHub, or (with `detail.status`) an error answer no other code covers. */
  | "network";

export class GitSyncError extends Error {
  readonly code: GitSyncErrorCode;

  constructor(
    code: GitSyncErrorCode,
    message: string,
    readonly detail?: { resetAt?: number; status?: number; paths?: string[] },
  ) {
    super(message);
    this.name = "GitSyncError";
    this.code = code;
  }
}
