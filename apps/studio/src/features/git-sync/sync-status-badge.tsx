import { CircleCheckIcon, CloudDownloadIcon, GitCompareArrowsIcon, PencilLineIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { t } from "@/i18n/runtime";
import { useRepoStatus } from "./use-repo-status";

/** Shows how a linked project relates to GitHub; renders nothing when unlinked. */
export function SyncStatusBadge({ projectId }: { projectId: string }) {
  const status = useRepoStatus(projectId);
  if (!status) return null;

  const { state, localChanges } = status;
  const Icon =
    state === "in_sync"
      ? CircleCheckIcon
      : state === "local"
        ? PencilLineIcon
        : state === "remote"
          ? CloudDownloadIcon
          : GitCompareArrowsIcon;
  const color = state === "in_sync" ? "text-emerald-500" : state === "diverged" ? "text-destructive" : "text-amber-500";
  const label =
    state === "local" ? t("project.git.status.local", { count: localChanges }) : t(`project.git.status.${state}`);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span role="img" aria-label={label} className={`inline-flex shrink-0 ${color}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
