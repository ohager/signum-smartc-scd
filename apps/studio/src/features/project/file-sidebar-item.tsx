import type { ProjectFile } from "@/types/project";
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
import { useLocation, useNavigate } from "react-router";

interface Props {
  file: ProjectFile;
  projectId: string;
  isActive?: boolean;
}

export function FileSidebarItem({ file, projectId, isActive }: Props) {
  const FileIcon = FileTypeIcons[file.type];
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const handleOpenFile = () => {
    navigate(`/projects/${projectId}/files/${file.id}`);
  };

  const handleRenameFile = () => {
    // Implement file renaming logic here
  };

  const handleDeleteFile = () => {
    // Implement file deletion logic here
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
              onClick={() => {}}
              className="text-destructive focus:text-destructive"
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </SidebarMenuSubItem>
  );
}
