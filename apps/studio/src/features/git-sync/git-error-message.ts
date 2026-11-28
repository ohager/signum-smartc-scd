import { t } from "@/i18n/runtime";
import { GitSyncError, type GitSyncErrorCode } from "@/lib/git-sync/errors";

const MESSAGES: Record<Exclude<GitSyncErrorCode, "rate_limited" | "path_taken" | "network">, () => string> = {
  no_token: () => t("project.git.errors.no_token"),
  auth: () => t("project.git.errors.auth"),
  forbidden: () => t("project.git.errors.forbidden"),
  not_found: () => t("project.git.errors.not_found"),
  not_fast_forward: () => t("project.git.errors.not_fast_forward"),
  truncated: () => t("project.git.errors.truncated"),
  no_marker: () => t("project.git.errors.no_marker"),
  nested_markers: () => t("project.git.errors.nested_markers"),
  format_unsupported: () => t("project.git.errors.format_unsupported"),
  invalid_marker: () => t("project.git.errors.invalid_marker"),
  locked: () => t("project.git.errors.locked"),
  stale: () => t("project.git.errors.stale"),
  nothing_to_push: () => t("project.git.errors.nothing_to_push"),
  multiple_contracts: () => t("project.git.errors.multiple_contracts"),
  marker_changed: () => t("project.git.errors.marker_changed"),
  undo_expired: () => t("project.git.errors.undo_expired"),
  unresolved_conflicts: () => t("project.git.errors.unresolved_conflicts"),
};

/** User-facing text for any error from sync; other errors keep their own message. */
export function gitErrorMessage(e: unknown): string {
  if (!(e instanceof GitSyncError)) return e instanceof Error ? e.message : String(e);
  if (e.code === "rate_limited") {
    return e.detail?.resetAt
      ? t("project.git.errors.rate_limited", { time: new Date(e.detail.resetAt).toLocaleTimeString() })
      : t("project.git.errors.rate_limited_unknown");
  }
  if (e.code === "path_taken") {
    return t("project.git.errors.path_taken", { paths: (e.detail?.paths ?? []).join(", ") });
  }
  if (e.code === "network") {
    return e.detail?.status
      ? t("project.git.errors.http_error", { status: String(e.detail.status) })
      : t("project.git.errors.network");
  }
  return MESSAGES[e.code]();
}
