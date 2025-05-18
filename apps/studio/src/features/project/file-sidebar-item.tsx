import { FileTypeIcons } from "./filetype-icons";
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
import { useNavigate } from "react-router";
import type { FileMetadata } from "@/lib/file-system";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog.tsx";
import { useState } from "react";

interface Props {
  file: FileMetadata;
  projectId: string;
  isActive?: boolean;
}

export function FileSidebarItem({ file, projectId, isActive }: Props) {
  const fs = useFileSystem();
  const FileIcon = FileTypeIcons[file.type];
  const navigate = useNavigate();
  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);

  const handleOpenFile = () => {
    navigate(`/projects/${projectId}/files/${file.id}`);
  };

  const handleRenameFile = () => {
    // Implement file renaming logic here
  };

  return (
    <SidebarMenuSubItem>
      <div className="relative flex items-center cursor-pointer">
        <SidebarMenuSubButton
          onClick={handleOpenFile}
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
            <DropdownMenuItem onClick={() => {}}>Rename</DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setShowDeleteConfirmDialog(true)}
              className="text-destructive focus:text-destructive"
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <ConfirmationDialog
        open={showDeleteConfirmDialog}
        onOpenChange={setShowDeleteConfirmDialog}
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
