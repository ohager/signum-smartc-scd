import { Badge } from "@/components/ui/badge";
import { Page, PageContent, PageHeader } from "@/components/ui/page";
import { Navigate, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import type { File, FileSystemEvent } from "@/lib/file-system"
import { SmartCFileEditor } from "@/features/smartc-editor/smartc-file-editor.tsx";
import { FileTypes } from "@/features/project/filetype-icons.tsx";
import { AsmFileEditor } from "@/features/asm-editor/asm-file-editor.tsx";
import { ScenarioEditor } from "@/features/simulator/scenario/scenario-editor.tsx";
import { TestFileEditor } from "@/features/testbed/ui/test-file-editor";

type FilesPageParams = {
  projectId: string;
  fileId: string;
};

export function FilesPage() {
  const fs = useFileSystem();
  const { fileId = "", projectId = "" } = useParams<FilesPageParams>();

  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Switching files starts over: without this the previous file stayed on
    // screen under the new URL whenever the new one failed to load, and two
    // loads racing could settle on the one the user left.
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setFile(null);

    const loadFile = async () => {
      try {
        const loaded = await fs.loadFile(fileId);
        if (cancelled) return;
        setFile(loaded);
        fs.recents.record(fileId, Date.now());
      } catch (err) {
        if (!cancelled) setError(err as Error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    loadFile();

    return () => {
      cancelled = true;
    };
  }, [fileId]);

  // The page read this file once. Renaming it in the sidebar left the old
  // name in the header, and deleting it left an editor open over a file that
  // no longer exists — whose next save fails with "File not found", taking
  // the buffer with it.
  useEffect(() => {
    const concerns = (event: Event) =>
      (event as CustomEvent<FileSystemEvent>).detail.id === fileId;

    // Metadata only: the buffer belongs to the editor, and replacing the
    // content here would undo whatever has been typed since.
    const adoptMetadata = () => {
      const metadata = fs.getFileMetadata(fileId);
      if (!metadata) return;
      setFile((current) => (current ? { ...current, metadata } : current));
      // A move leaves the project in the URL behind, which is what the
      // sidebar matches on to mark the row as open.
      if (metadata.folderId !== projectId) {
        navigate(`/projects/${metadata.folderId}/files/${fileId}`, { replace: true });
      }
    };

    const onRenamedOrMoved = (event: Event) => {
      if (concerns(event)) adoptMetadata();
    };

    const onDeleted = (event: Event) => {
      if (concerns(event)) navigate("/", { replace: true });
    };

    const onWorkspaceReloaded = () => {
      if (fs.exists(fileId)) adoptMetadata();
      else navigate("/", { replace: true });
    };

    fs.addEventListener("file:renamed", onRenamedOrMoved);
    fs.addEventListener("file:moved", onRenamedOrMoved);
    fs.addEventListener("file:deleted", onDeleted);
    fs.addEventListener("fs:reloaded", onWorkspaceReloaded);

    return () => {
      fs.removeEventListener("file:renamed", onRenamedOrMoved);
      fs.removeEventListener("file:moved", onRenamedOrMoved);
      fs.removeEventListener("file:deleted", onDeleted);
      fs.removeEventListener("fs:reloaded", onWorkspaceReloaded);
    };
  }, [fileId, projectId, navigate]);

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
        <h1 className="truncate text-sm font-semibold">{name}</h1>
        <Badge variant="secondary">{type}</Badge>
      </PageHeader>
      {/* The editors are direct children on purpose. A wrapper div sat here
          grouping the branches, and once PageContent became a flex column it
          broke the height chain: a block box between them gives the editors no
          flex context, so their `flex-1` means nothing, they size to content,
          and Monaco — which has no intrinsic height — collapses to zero. */}
      <PageContent className="overflow-hidden">
        {type === FileTypes.SmartC && (
          <SmartCFileEditor key={id} file={file!} />
        )}
        {type === FileTypes.ASM && (
          <AsmFileEditor key={id} file={file!} />
        )}
        {type === FileTypes.Scenario && <ScenarioEditor key={id} file={file!} />}
        {type === FileTypes.Test && <TestFileEditor key={id} file={file!} />}
        {type !== FileTypes.SmartC && type !== FileTypes.ASM && type !== FileTypes.Scenario && type !== FileTypes.Test && (
          <div className="p-4 text-sm text-muted-foreground">
            This file type ("{type}") is no longer supported.
          </div>
        )}
      </PageContent>
    </Page>
  );
}
