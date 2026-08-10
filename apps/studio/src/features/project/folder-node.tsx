import { useState } from "react";
import type { DragEvent } from "react";
import {
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuAction,
  SidebarMenuSub,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  EditIcon,
  FilePlus2,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  MoreVerticalIcon,
  TrashIcon,
} from "lucide-react";
import type { FolderMetadata } from "@/lib/file-system";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import { useNavigate } from "react-router";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { NameInputDialog } from "./name-input-dialog";
import { NewFileDialog } from "./new-file-dialog";
import { FileSidebarItem, FILE_DND_MIME } from "./file-sidebar-item";
import { uniqueName } from "./file-naming";
import { toast } from "sonner";

export function FolderNode({ folder }: { folder: FolderMetadata }) {
  const fs = useFileSystem();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [showNewFile, setShowNewFile] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showRename, setShowRename] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const { folders, files } = fs.listFolderContents(folder.id);
  const fileNames = files.map((f) => f.metadata.name);
  const folderNames = folders.map((f) => f.metadata.name);

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setDropActive(false);
    const fileId = e.dataTransfer.getData(FILE_DND_MIME);
    if (!fileId) return;
    try {
      await fs.moveFile(fileId, folder.id);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <>
      <SidebarMenuItem>
        <div
          className={"relative flex items-center rounded-sm " + (dropActive ? "bg-blue-500/20" : "")}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(FILE_DND_MIME)) {
              e.preventDefault();
              setDropActive(true);
            }
          }}
          onDragLeave={() => setDropActive(false)}
          onDrop={onDrop}
        >
          <SidebarMenuButton onClick={() => setExpanded(!expanded)} className="flex-1 cursor-pointer">
            {expanded ? (
              <>
                <ChevronDownIcon />
                <FolderOpenIcon />
              </>
            ) : (
              <>
                <ChevronRightIcon />
                <FolderIcon />
              </>
            )}
            <span>{folder.name}</span>
          </SidebarMenuButton>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuAction className="opacity-0 group-hover/menu-item:opacity-100 cursor-pointer">
                <MoreVerticalIcon className="h-8 w-8" />
              </SidebarMenuAction>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[160px]">
              <DropdownMenuItem onClick={() => setShowNewFile(true)}>
                <FilePlus2 className="h-4 w-4" />
                Add File
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowNewFolder(true)}>
                <FolderPlusIcon className="h-4 w-4" />
                New Folder
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowRename(true)}>
                <EditIcon className="h-4 w-4" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setShowDelete(true)}
                className="text-destructive focus:text-destructive"
              >
                <TrashIcon className="h-4 w-4" color="red" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {expanded && (folders.length > 0 || files.length > 0) && (
          <SidebarMenuSub>
            {folders.map((f) => (
              <FolderNode key={f.id} folder={f.metadata} />
            ))}
            {files.map((f) => (
              <FileSidebarItem key={f.id} file={f.metadata} projectId={folder.id} />
            ))}
          </SidebarMenuSub>
        )}
      </SidebarMenuItem>

      <NewFileDialog
        open={showNewFile}
        onOpenChange={setShowNewFile}
        existingNames={fileNames}
        onCreate={async (name, type, content) => {
          try {
            const id = await fs.addFile(folder.id, name, type, content);
            setExpanded(true);
            navigate(`/projects/${folder.id}/files/${id}`);
          } catch (e: any) {
            toast.error(e.message);
          }
        }}
      />

      <NameInputDialog
        open={showNewFolder}
        onOpenChange={setShowNewFolder}
        title="New Folder"
        label="Folder name"
        submitLabel="Create"
        onSubmit={async (n) => {
          try {
            await fs.createFolder(folder.path, uniqueName(n, folderNames));
            setExpanded(true);
          } catch (e: any) {
            toast.error(e.message);
          }
        }}
      />

      <NameInputDialog
        open={showRename}
        onOpenChange={setShowRename}
        title="Rename Folder"
        label="Folder name"
        initialValue={folder.name}
        submitLabel="Rename"
        validate={(n) => (folderNames.includes(n) ? "A folder with this name already exists" : null)}
        onSubmit={async (n) => {
          try {
            await fs.renameFolder(folder.id, n);
          } catch (e: any) {
            toast.error(e.message);
          }
        }}
      />

      <ConfirmationDialog
        open={showDelete}
        onOpenChange={setShowDelete}
        onConfirm={() => fs.deleteFolder(folder.id)}
        title="Delete Folder"
        description="Delete this folder and all its contents? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
      />
    </>
  );
}
