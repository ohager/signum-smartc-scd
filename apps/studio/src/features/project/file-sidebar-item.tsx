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
import { MoreVerticalIcon } from "lucide-react";
import { useMatch, useNavigate } from "react-router";
import type { FileMetadata } from "@/lib/file-system";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog.tsx";
import { NameInputDialog } from "./name-input-dialog";
import { useState } from "react";
import { toast } from "sonner";

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
  const siblingNames = new Set(
    fs
      .listFolderContents(projectId)
      .files.map((f) => f.metadata.name)
      .filter((n) => n !== file.name),
  );

  return (
    <SidebarMenuSubItem>
      <div
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
            <DropdownMenuItem onClick={() => setShowRename(true)}>Rename</DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setShowDelete(true)}
              className="text-destructive focus:text-destructive"
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <NameInputDialog
        open={showRename}
        onOpenChange={setShowRename}
        title="Rename File"
        label="File name"
        initialValue={file.name}
        submitLabel="Rename"
        validate={(n) => (siblingNames.has(n) ? "A file with this name already exists" : null)}
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
        title="Delete File"
        description="Are you sure you want to delete this file? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
      />
    </SidebarMenuSubItem>
  );
}
