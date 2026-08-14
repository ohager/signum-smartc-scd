import { Page, PageContent } from "@/components/ui/page";
import { useFileSystem } from "@/hooks/use-file-system";
import { summarizeProjects, type ProjectSummary } from "@/features/home/project-summary";
import { useEffect, useState } from "react";

export function HomePage() {
  const fs = useFileSystem();
  const [projects, setProjects] = useState<ProjectSummary[]>(() => summarizeProjects(fs));

  // Keep the page live: creating, deleting, renaming or moving anything in the
  // workspace re-summarizes. Same subscription the sidebar uses.
  useEffect(() => {
    const refresh = () => setProjects(summarizeProjects(fs));
    fs.addEventListener("file:*", refresh);
    fs.addEventListener("folder:*", refresh);
    return () => {
      fs.removeEventListener("file:*", refresh);
      fs.removeEventListener("folder:*", refresh);
    };
  }, []);

  const isEmptyWorkspace = projects.length === 0;

  return (
    <Page>
      <PageContent className="overflow-y-auto">
        <p className="p-6 text-sm text-muted-foreground">
          {isEmptyWorkspace
            ? "Empty workspace"
            : `${projects.length} project(s): ${projects.map((p) => p.name).join(", ")}`}
        </p>
      </PageContent>
    </Page>
  );
}
