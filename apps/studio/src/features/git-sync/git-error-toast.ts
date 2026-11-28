import { toast } from "sonner";
import { t } from "@/i18n/runtime";
import { GitSyncError } from "@/lib/git-sync/errors";
import { gitErrorMessage } from "./git-error-message";

/** Error toast for a sync failure; a rejected or under-scoped token gets a "Change token" action. */
export function toastGitError(e: unknown, openTokenDialog: () => Promise<boolean>): void {
  const tokenProblem = e instanceof GitSyncError && (e.code === "auth" || e.code === "forbidden");
  toast.error(
    gitErrorMessage(e),
    tokenProblem
      ? { action: { label: t("project.git.token.change"), onClick: () => void openTokenDialog() } }
      : undefined,
  );
}
