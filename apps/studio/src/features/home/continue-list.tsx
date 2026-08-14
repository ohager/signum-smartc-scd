import { getFileTypeIcon } from "@/features/project/filetype-icons";
import { useFileSystem } from "@/hooks/use-file-system";
import type { ResolvedRecent } from "@/hooks/use-recent-files";
import { revealFileRequestAtom } from "@/stores/project-tree-atoms";
import { findFolderChainToFile } from "@/features/project/tree-reveal";
import { useSetAtom } from "jotai";
import { useNavigate } from "react-router";

interface Props {
  recents: ResolvedRecent[];
}

/** "2 min ago" style label. Coarse on purpose — the exact minute never matters. */
function relativeTime(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

export function ContinueList({ recents }: Props) {
  const fs = useFileSystem();
  const navigate = useNavigate();
  const setRevealRequest = useSetAtom(revealFileRequestAtom);
  const now = Date.now();

  if (recents.length === 0) return null;

  const open = (recent: ResolvedRecent) => {
    const chain = findFolderChainToFile(fs, recent.fileId);
    if (chain.length) {
      setRevealRequest({ fileId: recent.fileId, folderIds: new Set(chain) });
    }
    navigate(`/projects/${recent.projectId}/files/${recent.fileId}`);
  };

  return (
    <section className="px-6 py-6">
      <h2 className="mb-4 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        Continue where you left off
        <span className="h-px flex-1 bg-border" />
      </h2>

      <ul className="flex flex-col gap-1">
        {recents.map((recent) => {
          const FileIcon = getFileTypeIcon(recent.type);
          const projectName = fs.getFolder(recent.projectId).name;
          return (
            <li key={recent.fileId}>
              <button
                type="button"
                onClick={() => open(recent)}
                className="group relative flex w-full items-center gap-2.5 overflow-hidden rounded-md border border-transparent px-3 py-2 text-left text-sm transition-colors hover:border-border hover:bg-muted/60"
              >
                {/* Accent edge, revealed on hover — the row's only colour. */}
                <span className="absolute inset-y-0 left-0 w-0.5 scale-y-0 bg-signum-blue transition-transform duration-200 group-hover:scale-y-100 dark:bg-signum-lightblue" />
                <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-signum-blue dark:group-hover:text-signum-lightblue" />
                <span className="truncate font-medium">{recent.name}</span>
                <span className="truncate text-xs text-muted-foreground">· {projectName}</span>
                <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                  {relativeTime(recent.openedAt, now)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
