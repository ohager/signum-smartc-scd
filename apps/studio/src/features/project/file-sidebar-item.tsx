import { getFileTypeIcon } from "./filetype-icons";
import {
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarMenuAction,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVerticalIcon, DownloadIcon } from "lucide-react";
import { useMatch, useNavigate } from "react-router";
import type { FileMetadata } from "@/lib/file-system";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import { downloadBlob } from "@/lib/download.ts";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog.tsx";
import { NameInputDialog } from "./name-input-dialog";
import { useEffect, useRef, useState } from "react";
import { useAtom } from "jotai";
import { revealFileRequestAtom } from "@/stores/project-tree-atoms";
import { toast } from "sonner";
import { t } from "@/i18n/runtime";

/** MIME key used when dragging a file onto a folder to move it. */
export const FILE_DND_MIME = "application/x-smartc-fileid";

interface Props {
  file: FileMetadata;
  projectId: string; // parent folder id (for navigation + sibling lookup)
}

export function FileSidebarItem({ file, projectId }: Props) {
  const fs = useFileSystem();
  const FileIcon = getFileTypeIcon(file.type);
  const navigate = useNavigate();
  const [showDelete, setShowDelete] = useState(false);
  const [showRename, setShowRename] = useState(false);

  const isActive = !!useMatch(`/projects/${projectId}/files/${file.id}`);

  // Scroll into view when this file is the target of a reveal request. Runs on
  // mount too, i.e. when the enclosing folders just expanded for us.
  const rowRef = useRef<HTMLDivElement>(null);
  const [revealRequest, setRevealRequest] = useAtom(revealFileRequestAtom);
  useEffect(() => {
    if (revealRequest?.fileId !== file.id) return;
    rowRef.current?.scrollIntoView({ block: "nearest" });
    setRevealRequest(null);
  }, [revealRequest, file.id]);

  const siblingNames = new Set(
    fs
      .listFolderContents(projectId)
      .files.map((f) => f.metadata.name)
      .filter((n) => n !== file.name),
  );

  const onDownload = async () => {
    try {
      const loaded = await fs.loadFile<unknown>(file.id);
      const text =
        typeof loaded.content === "string"
          ? loaded.content
          : String(loaded.content ?? "");
      downloadBlob(file.name, new Blob([text], { type: "text/plain;charset=utf-8" }));
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <SidebarMenuSubItem>
      <div
        ref={rowRef}
        className="relative flex items-center cursor-pointer"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(FILE_DND_MIME, file.id);
          e.dataTransfer.effectAllowed = "move";
        }}
      >
        <SidebarMenuSubButton
          onClick={() => navigate(`/projects/${projectId}/files/${file.id}`)}
          isActive={isActive}
          className="flex-1"
        >
          <FileIcon className="h-4 w-4" />
          <span>{file.name}</span>
        </SidebarMenuSubButton>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuAction className="opacity-0 group-hover/menu-sub-item:opacity-100">
              <MoreVerticalIcon className="h-4 w-4" />
            </SidebarMenuAction>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[160px]">
            <DropdownMenuItem onClick={onDownload}>
              <DownloadIcon className="h-4 w-4" />
              {t("common.actions.download")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowRename(true)}>{t("common.actions.rename")}</DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setShowDelete(true)}
              className="text-destructive focus:text-destructive"
            >
              {t("common.actions.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <NameInputDialog
        open={showRename}
        onOpenChange={setShowRename}
        title={t("project.file.renameTitle")}
        label={t("project.file.fileName")}
        initialValue={file.name}
        submitLabel={t("common.actions.rename")}
        validate={(n) => (siblingNames.has(n) ? t("project.file.nameTaken") : null)}
        onSubmit={async (n) => {
          try {
            await fs.renameFile(file.id, n);
          } catch (e: any) {
            toast.error(e.message);
          }
        }}
      />

      <ConfirmationDialog
        open={showDelete}
        onOpenChange={setShowDelete}
        onConfirm={() => fs.deleteFile(file.id)}
        title={t("project.file.deleteTitle")}
        description={t("project.file.deleteConfirm")}
        confirmText={t("common.actions.delete")}
        cancelText={t("common.actions.cancel")}
        variant="destructive"
      />
    </SidebarMenuSubItem>
  );
}
