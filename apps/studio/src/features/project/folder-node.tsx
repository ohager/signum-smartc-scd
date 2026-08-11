import { useRef, useState } from "react";
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
  DownloadIcon,
  EditIcon,
  FileArchiveIcon,
  FilePlus2,
  FolderIcon,
  FolderInputIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  MoreVerticalIcon,
  TrashIcon,
  UploadIcon,
} from "lucide-react";
import type { FolderMetadata, ImportEntry } from "@/lib/file-system";
import { decodeTextOrNull } from "@/lib/file-system";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import { downloadBlob } from "@/lib/download.ts";
import { acceptedFileType } from "./filetype-icons";
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

  const uploadInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);

  const reportImport = (imported: number, skipped: number) => {
    toast.success(
      `Imported ${imported} file(s)` + (skipped ? ` (${skipped} skipped)` : ""),
    );
  };

  const filesToEntries = async (
    list: FileList,
    relative: boolean,
  ): Promise<ImportEntry[]> => {
    const entries: ImportEntry[] = [];
    for (const f of Array.from(list)) {
      const path = relative ? f.webkitRelativePath || f.name : f.name;
      const bytes = new Uint8Array(await f.arrayBuffer());
      entries.push({ path, content: decodeTextOrNull(bytes) });
    }
    return entries;
  };

  const onDownloadZip = async () => {
    try {
      const bytes = await fs.transfer.exportFolderZip(folder.id);
      downloadBlob(`${folder.name}.zip`, new Blob([bytes], { type: "application/zip" }));
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const onUploadFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    try {
      if (list && list.length) {
        const entries = await filesToEntries(list, false);
        const res = await fs.transfer.importEntries(folder.id, entries, acceptedFileType);
        setExpanded(true);
        reportImport(res.imported, res.skipped);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      e.target.value = "";
    }
  };

  const onImportZip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    try {
      if (file) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const res = await fs.transfer.importZip(folder.id, bytes, acceptedFileType);
        setExpanded(true);
        reportImport(res.imported, res.skipped);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      e.target.value = "";
    }
  };

  const onImportFolder = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    try {
      if (list && list.length) {
        const entries = await filesToEntries(list, true);
        const res = await fs.transfer.importEntries(folder.id, entries, acceptedFileType);
        setExpanded(true);
        reportImport(res.imported, res.skipped);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      e.target.value = "";
    }
  };

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
              <DropdownMenuItem onClick={onDownloadZip}>
                <DownloadIcon className="h-4 w-4" />
                Download (zip)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => uploadInputRef.current?.click()}>
                <UploadIcon className="h-4 w-4" />
                Upload File(s)…
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => zipInputRef.current?.click()}>
                <FileArchiveIcon className="h-4 w-4" />
                Import ZIP…
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => dirInputRef.current?.click()}>
                <FolderInputIcon className="h-4 w-4" />
                Import Folder…
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

      <input
        ref={uploadInputRef}
        type="file"
        multiple
        accept=".smart.c,.scenario.json,.asm"
        hidden
        onChange={onUploadFiles}
      />
      <input ref={zipInputRef} type="file" accept=".zip" hidden onChange={onImportZip} />
      <input
        ref={dirInputRef}
        type="file"
        hidden
        onChange={onImportFolder}
        {...({ webkitdirectory: "" } as any)}
      />

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
