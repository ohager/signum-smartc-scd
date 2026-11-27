import { useState, type ReactNode } from "react";
import { useAtomValue } from "jotai";
import { toast } from "sonner";
import { GitBranchIcon, GitCommitHorizontalIcon, GitPullRequestArrowIcon, UnlinkIcon } from "lucide-react";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { lockedProjectsAtom } from "@/features/assistant/state";
import { t } from "@/i18n/runtime";
import { CommitDialog } from "./commit-dialog";
import { toastGitError } from "./git-error-toast";
import { useGitSync, useRepoLink } from "./git-sync-context";
import { LinkDialog } from "./link-dialog";
import { usePull } from "./use-pull";

/**
 * GitHub entries for a project root's menu (`items`, to go inside the dropdown) and the
 * dialogs they open (`dialogs`, to render outside it so closing the menu keeps them mounted).
 */
export function useProjectGit(projectId: string): { items: ReactNode; dialogs: ReactNode } {
  const { requireToken, sync, openTokenDialog } = useGitSync();
  const link = useRepoLink(projectId);
  const locked = useAtomValue(lockedProjectsAtom).has(projectId);
  const { pull, resolve, busy, dialog: conflictDialog } = usePull(projectId);
  const [linkOpen, setLinkOpen] = useState(false);
  const [commitOpen, setCommitOpen] = useState(false);
  const [unlinkOpen, setUnlinkOpen] = useState(false);

  const lockReason = locked ? t("project.git.menu.locked") : undefined;

  const openIfToken = async (open: () => void) => {
    try {
      if (await requireToken()) open();
    } catch (e) {
      toastGitError(e, openTokenDialog);
    }
  };

  const items = link ? (
    <>
      <DropdownMenuItem disabled={locked || busy} title={lockReason} onClick={() => void pull()}>
        <GitPullRequestArrowIcon className="h-4 w-4" />
        {t("project.git.menu.pull")}
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={locked}
        title={lockReason}
        onClick={() => void openIfToken(() => setCommitOpen(true))}
      >
        <GitCommitHorizontalIcon className="h-4 w-4" />
        {t("project.git.menu.commit")}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => setUnlinkOpen(true)}>
        <UnlinkIcon className="h-4 w-4" />
        {t("project.git.menu.unlink")}
      </DropdownMenuItem>
    </>
  ) : (
    <DropdownMenuItem disabled={locked} title={lockReason} onClick={() => void openIfToken(() => setLinkOpen(true))}>
      <GitBranchIcon className="h-4 w-4" />
      {t("project.git.link.menu")}
    </DropdownMenuItem>
  );

  const dialogs = (
    <>
      {conflictDialog}
      <LinkDialog
        projectId={projectId}
        open={linkOpen}
        onOpenChange={setLinkOpen}
        onConflicts={(prepared) => void resolve(prepared)}
      />
      <CommitDialog projectId={projectId} open={commitOpen} onOpenChange={setCommitOpen} onPull={() => void pull()} />
      <ConfirmationDialog
        open={unlinkOpen}
        onOpenChange={setUnlinkOpen}
        onConfirm={() => {
          sync.unlink(projectId);
          toast.success(t("project.git.menu.unlinked"));
        }}
        title={t("project.git.menu.unlinkTitle")}
        description={t("project.git.menu.unlinkConfirm")}
        confirmText={t("project.git.menu.unlink")}
        cancelText={t("common.actions.cancel")}
      />
    </>
  );

  return { items, dialogs };
}
