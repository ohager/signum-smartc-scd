import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
} from "@/components/ui/sidebar";
import type { Project } from "@/types/project";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown, ChevronDownIcon,
  ChevronRightIcon,
  EditIcon,
  FilePlus2,
  FolderIcon,
  FolderOpenIcon,
  MoreVerticalIcon,
  TrashIcon
} from "lucide-react";
import { FileSidebarItem } from "./file-sidebar-item";
import { jotaiStore } from "@/stores/jotai-store";
import { deleteProjectAtom } from "@/stores/project-atoms";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import type { FolderMetadata } from "@/lib/file-system";
import { useFileSystem } from "@/hooks/use-file-system.ts";

interface Props {
  project: FolderMetadata;
}

function actionDeleteProject(projectId: string) {
  jotaiStore.set(deleteProjectAtom, projectId);
}

export function ProjectSidebarItem({ project }: Props) {
  const fs = useFileSystem();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const files = fs.listFolderContents(project.id).files;

  return (
    <>
      <SidebarMenuItem>
        <div className="relative flex items-center">
          <SidebarMenuButton
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex-1 cursor-pointer"
          >
            {isExpanded ? <><ChevronDownIcon/><FolderOpenIcon /></> : <><ChevronRightIcon /><FolderIcon /></>}
            <span>{project.name}</span>
          </SidebarMenuButton>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuAction className="opacity-0 group-hover/menu-item:opacity-100 cursor-pointer">
                <MoreVerticalIcon className="h-8 w-8" />
              </SidebarMenuAction>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[160px]">
              <DropdownMenuItem onClick={() => {}}>
                <FilePlus2 className="h-4 w-4" />
                Add File
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {}}>
                <EditIcon className="h-4 w-4" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setShowConfirmDialog(true)}
                className="text-destructive focus:text-destructive"
              >
                <TrashIcon className="h-4 w-4" color="red" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {isExpanded && files.length > 0 && (
          <SidebarMenuSub>
            {files.map((file) => (
              <FileSidebarItem
                key={file.id}
                file={file.metadata}
                projectId={project.id}
              />
            ))}
          </SidebarMenuSub>
        )}
      </SidebarMenuItem>

      <ConfirmationDialog
        open={showConfirmDialog}
        onOpenChange={setShowConfirmDialog}
        onConfirm={() => actionDeleteProject(project.id)}
        title="Delete Project"
        description="Are you sure you want to delete this project? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
      />
    </>
  );
}
