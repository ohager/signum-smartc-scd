import { Badge } from "@/components/ui/badge";
import { Page, PageContent, PageHeader } from "@/components/ui/page";
import { useFile } from "@/hooks/use-file";
import { Navigate, useParams } from "react-router";
import useSWR from "swr";
import { toast } from "sonner";
import { usePageHeaderActions } from "@/hooks/use-page-header-actions.ts";
import {
  SCDFileEditor,
} from "@/features/scd-builder/scd-file-editor.tsx";

type FilesPageParams = {
  projectId: string;
  fileId: string;
};

export function FilesPage() {
  const { getFile } = useFile();
  const {} = usePageHeaderActions();
  const { fileId = "", projectId = "" } = useParams<FilesPageParams>();

  const {
    data: file,
    error,
    isLoading,
    mutate,
  } = useSWR(`GET projects/${projectId}/files/${fileId}`, async () => {
    const file = await getFile({ projectId, fileId });
    if (!file) {
      throw new Error("File not found");
    }
    return file;
  });

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
      <PageContent>
        <div className="flex-1">
          {f.type === "scd" && (
            <SCDFileEditor
              key={f.id}
              file={file!}
              onSave={() => mutate()}
            />
          )}
          {f.type === "test" && <div>Test Environment</div>}
          {!["scd", "test"].includes(f.type) && <div>Code Editor</div>}
        </div>
      </PageContent>
    </Page>
  );
}
