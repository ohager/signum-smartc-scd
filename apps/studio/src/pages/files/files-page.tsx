import { Badge } from "@/components/ui/badge";
import { Page, PageContent, PageHeader } from "@/components/ui/page";
import { Navigate, useParams } from "react-router";
import { toast } from "sonner";
import { usePageHeaderActions } from "@/hooks/use-page-header-actions.ts";
import { SCDFileEditor } from "@/features/scd-editor/scd-file-editor.tsx";
import { useEffect, useState } from "react";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import type {File} from "@/lib/file-system"

type FilesPageParams = {
  projectId: string;
  fileId: string;
};

export function FilesPage() {
  const fs = useFileSystem();
  const {} = usePageHeaderActions();
  const { fileId = "", projectId = "" } = useParams<FilesPageParams>();

  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadFile = async () => {
      try {
        const file = await fs.loadFile(fileId);
        setFile(file);
      } catch (err) {
        setError(err as Error);
      } finally {
        setIsLoading(false);
      }
    };
    loadFile();
  }, [projectId, fileId]);

  if (!file && isLoading) {
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

  const {name, type, id} = file!.metadata
  return (
    <Page>
      <PageHeader>
        <h1 className="text-sm font-semibold">{name}</h1>
        <Badge variant="secondary">{type}</Badge>
      </PageHeader>
      <PageContent className="overflow-hidden">
        <div className="flex-1">
          {type === "scd" && <SCDFileEditor key={id} file={file!} />}
          {/*{type === "contract" && (*/}
          {/*  <SmartCFileEditor key={id} file={file!} />*/}
          {/*)}*/}
          {/*{type === "asm" && (*/}
          {/*  <AsmFileEditor key={id} file={file!} />*/}
          {/*)}*/}
        </div>
      </PageContent>
    </Page>
  );
}
