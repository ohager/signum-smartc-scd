import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ProjectSummary } from "@/features/home/project-summary";
import { findFolderChainToFile } from "@/features/project/tree-reveal";
import { useFileSystem } from "@/hooks/use-file-system";
import { revealFileRequestAtom } from "@/stores/project-tree-atoms";
import { useSetAtom } from "jotai";
import { FolderIcon } from "lucide-react";
import { useNavigate } from "react-router";

interface Props {
  projects: ProjectSummary[];
}

export function ProjectGrid({ projects }: Props) {
  const fs = useFileSystem();
  const navigate = useNavigate();
  const setRevealRequest = useSetAtom(revealFileRequestAtom);

  const open = (project: ProjectSummary) => {
    if (!project.mainFileId) return;
    const chain = findFolderChainToFile(fs, project.mainFileId);
    if (chain.length) {
      setRevealRequest({ fileId: project.mainFileId, folderIds: new Set(chain) });
    }
    navigate(`/projects/${project.id}/files/${project.mainFileId}`);
  };

  return (
    <section className="px-6 py-6">
      <h2 className="mb-4 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        Projects
        <span className="h-px flex-1 bg-border" />
      </h2>

      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {projects.map((project) => (
          <li key={project.id}>
            <Card className="group h-full transition-colors hover:border-signum-blue/40 dark:hover:border-signum-lightblue/40">
              <CardContent className="flex h-full flex-col gap-3 p-4">
                <div className="flex items-center gap-2">
                  <FolderIcon className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-signum-blue dark:group-hover:text-signum-lightblue" />
                  <span className="truncate text-sm font-medium">{project.name}</span>
                </div>

                <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  {project.fileCount === 1 ? "1 file" : `${project.fileCount} files`}
                  {project.mainFileId ? "" : " · nothing to open yet"}
                </p>

                <Button
                  size="sm"
                  variant="outline"
                  className="mt-auto w-full"
                  disabled={!project.mainFileId}
                  onClick={() => open(project)}
                >
                  Open
                </Button>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
