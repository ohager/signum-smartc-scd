import { SCDBuilder } from "@/features/scd-builder";
import { useFile } from "@/hooks/use-file";
import { Navigate, useParams } from "react-router";
import useSWR from "swr";

// You might want to create a separate Header component
function FileHeader({
  fileName,
  fileType,
}: {
  fileName: string;
  fileType: string;
}) {
  return (
    <header className="p-4 bg-white border-b border-gray-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">{fileName}</h1>
          <span className="px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-full">
            {fileType}
          </span>
        </div>
      </div>
    </header>
  );
}

type FilesPageParams = {
  projectId: string;
  fileId: string;
};

export function FilesPage() {
  const { getFile } = useFile();

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
    console.error(error);
    return <div>Error loading file</div>;
  }

  return (
    <div className="flex flex-col h-full">
      <FileHeader fileName={file!.name} fileType={file!.type} />
      <div className="flex-1">
        {file!.type === "scd" && (
          <SCDBuilder key={file!.id} file={file!} onSave={() => mutate()} />
        )}
        {file!.type === "test" && <div>Test Environment</div>}
        {!["scd", "test"].includes(file!.type) && <div>Code Editor</div>}
      </div>
    </div>
  );
}
