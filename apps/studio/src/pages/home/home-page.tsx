import { Page, PageContent } from "@/components/ui/page";
import { useFileSystem } from "@/hooks/use-file-system";
import { summarizeProjects, type ProjectSummary } from "@/features/home/project-summary";
import { Hero } from "@/features/home/hero";
import { HowItWorks } from "@/features/home/how-it-works";
import { acceptedFileType } from "@/features/project/filetype-icons";
import { uniqueName } from "@/features/project/file-naming";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

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

  const importInputRef = useRef<HTMLInputElement>(null);

  const onImportProject = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    try {
      if (file) {
        const rootNames = fs.listFolderContents().folders.map((f) => f.metadata.name);
        const base = file.name.replace(/\.zip$/i, "");
        const folderId = await fs.createFolder("/", uniqueName(base, rootNames));
        const bytes = new Uint8Array(await file.arrayBuffer());
        const res = await fs.transfer.importZip(folderId, bytes, acceptedFileType);
        toast.success(
          `Imported ${res.imported} file(s)` + (res.skipped ? ` (${res.skipped} skipped)` : ""),
        );
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      e.target.value = "";
    }
  };

  const isEmptyWorkspace = projects.length === 0;

  return (
    <Page>
      <PageContent className="overflow-y-auto">
        <input ref={importInputRef} type="file" accept=".zip" hidden onChange={onImportProject} />
        <Hero
          variant={isEmptyWorkspace ? "full" : "band"}
          onImportClick={() => importInputRef.current?.click()}
        />
        <HowItWorks />
      </PageContent>
    </Page>
  );
}
