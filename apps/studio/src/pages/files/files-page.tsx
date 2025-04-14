import { SCDBuilder } from "@/features/scd-builder";
import { useProjects } from "@/hooks/use-projects";
import { Navigate, useParams } from "react-router";

type FilesPageParams = {
  projectId: string;
  fileId: string;
};

export function FilesPage() {
  const { getFile } = useProjects();

  const { fileId = "", projectId = "" } = useParams<FilesPageParams>();
  const file = getFile({ projectId, fileId });

  if (!file) {
    return <Navigate to="/" replace />;
  }

  // TODO: check the files type an render the component accordingly
  if (file.type === "scd") {
    return <SCDBuilder file={file} />;
  }

  if (file.type === "test") {
    return <div>Test Environment</div>;
  }

  return <div>Code Editor</div>;
}
