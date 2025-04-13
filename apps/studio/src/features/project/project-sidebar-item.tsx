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
import { useState } from "react";
import {
  EditIcon,
  FilePlus2,
  FolderIcon,
  FolderOpenIcon,
  MoreVerticalIcon,
  TrashIcon,
} from "lucide-react";
import { FileSidebarItem } from "./file-sidebar-item";
import { jotaiStore } from "@/stores/jotaiStore";
import { deleteProjectAtom } from "@/stores/projectAtoms";

interface Props {
  project: Project;
  activeFileId?: string;
}

function actionDeleteProject(projectId: string) {
  jotaiStore.set(deleteProjectAtom, projectId);
}

export function ProjectSidebarItem({ project }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <SidebarMenuItem>
      <div className="relative flex items-center">
        <SidebarMenuButton
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex-1 cursor-pointer"
        >
          {isExpanded ? <FolderOpenIcon /> : <FolderIcon />}
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
              onClick={() => actionDeleteProject(project.id)}
              className="text-destructive focus:text-destructive"
            >
              <TrashIcon className="h-4 w-4" color="red" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isExpanded && project.files.length > 0 && (
        <SidebarMenuSub>
          {project.files.map((file) => (
            <FileSidebarItem key={file.id} file={file} projectId={project.id} />
          ))}
        </SidebarMenuSub>
      )}
    </SidebarMenuItem>
  );
}
