import { Badge } from "@/components/ui/badge";
import { Page, PageContent, PageHeader } from "@/components/ui/page";
import { useFile } from "@/hooks/use-file";
import { Navigate, useParams } from "react-router";
import { toast } from "sonner";
import { usePageHeaderActions } from "@/hooks/use-page-header-actions.ts";
import {
  SCDFileEditor,
} from "@/features/scd-builder/scd-file-editor.tsx";
import { SmartCEditor } from "@/features/code-editor/smartc-editor.tsx";
import { useEffect, useState } from "react";
import type { ProjectFile } from "@/types/project.ts";

type FilesPageParams = {
  projectId: string;
  fileId: string;
};

export function FilesPage() {
  const { getFile } = useFile();
  const {} = usePageHeaderActions();
  const { fileId = "", projectId = "" } = useParams<FilesPageParams>();

  const [file, setFile] = useState<ProjectFile | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadFile = async () => {
      try {
        const file = await getFile({ projectId, fileId });
        if (!file) {
          throw new Error("File not found");
        }
        setFile(file);
      } catch (err) {
        setError(err as Error);
      } finally {
        setIsLoading(false);
      }
    };
    loadFile();
  }, [projectId, fileId]);


  if (isLoading) {
    // to do loading screen
    return <div>Loading...</div>;
  }

  if (!file && !isLoading) {
    return <Navigate to="/" replace />;
  }

  if (error) {
    toast.error(error.message);
    return <div>Error loading file</div>;
  }

  const f = file!;

  return (
    <Page>
      <PageHeader>
        <h1 className="text-sm font-semibold">{f.name}</h1>
        <Badge variant="secondary">{f.type}</Badge>
      </PageHeader>
      <PageContent className="overflow-hidden">
        <div className="flex-1">
          {f.type === "scd" && (
            <SCDFileEditor
              key={f.id}
              file={file!}
            />
          )}
          {f.type === "contract" && <SmartCEditor key={f.id} file={file!}/>}
        </div>
      </PageContent>
    </Page>
  );
}
