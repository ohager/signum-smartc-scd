import { toast } from "sonner";
import { t } from "@/i18n/runtime";
import { toastGitError } from "./git-error-toast";
import type { GitSync } from "./sync-service";

const MAX_LISTED = 5;

/** "Skipped: a, b, c, d, e and 3 more" — at most five paths are named. */
export function skippedDescription(skipped: string[]): string | undefined {
  if (skipped.length === 0) return undefined;
  const names = skipped.slice(0, MAX_LISTED).join(", ");
  const more = skipped.length - MAX_LISTED;
  return t("project.git.pull.skipped", { names: more > 0 ? t("project.git.pull.andMore", { names, count: more }) : names });
}

/** Success toast for an applied pull: counts, skipped files, and an Undo pull action. */
export function toastPulled(
  title: string,
  skipped: string[],
  undoToken: string,
  sync: GitSync,
  openTokenDialog: () => Promise<boolean>,
): void {
  toast.success(title, {
    description: skippedDescription(skipped),
    duration: 15000,
    action: {
      label: t("project.git.pull.undo"),
      onClick: () => {
        sync
          .undoPull(undoToken)
          .then(() => toast.success(t("project.git.pull.undone")))
          .catch((e) => toastGitError(e, openTokenDialog));
      },
    },
  });
}
