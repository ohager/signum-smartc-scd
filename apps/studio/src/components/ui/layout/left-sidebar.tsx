import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarMenuAction,
} from "../sidebar";

import {
  SettingsIcon,
  PlusIcon,
  MoreVerticalIcon,
  FilePlus2,
  EditIcon,
  TrashIcon,
  FlaskConical,
  FlaskConicalIcon,
  CrownIcon,
  WalletIcon,
  UploadIcon,
} from "lucide-react";
import { Button } from "../button";
import { Dialog, DialogTrigger } from "../dialog";
import { NewProjectDialog } from "@/features/project/new-project-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "../tooltip";
import { FolderNode } from "@/features/project/folder-node";
import { useEffect, useRef, useState } from "react";
import { ThemeSwitch } from "@/components/theme-switch";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import { acceptedFileType } from "@/features/project/filetype-icons";
import { uniqueName } from "@/features/project/file-naming";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { wallet } from "@/lib/wallet.ts";
import type { NetworkType } from "@/types/wallet.types.ts";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog.tsx";
import { AlertDialog } from "@/components/ui/alert-dialog.tsx";
import { WalletStatusCard } from "@/components/ui/wallet-status-card.tsx";

const footerItems = [
  {
    title: "Settings",
    url: "#",
    icon: SettingsIcon,
  },
];

export function LeftSidebar() {
  const fs = useFileSystem();

  const [projects, setProjects] = useState([
    ...fs.listFolderContents().folders,
  ]);

  useEffect(() => {
    function updateFolders() {
      setProjects([...fs.listFolderContents().folders]);
    }

    fs.addEventListener("file:*", updateFolders);
    fs.addEventListener("folder:*", updateFolders);
    return () => {
      fs.removeEventListener("folder:*", updateFolders);
      fs.removeEventListener("file:*", updateFolders);
    };
  }, []);


  const [isOpen, setIsOpen] = useState(false);

  const importInputRef = useRef<HTMLInputElement>(null);

  const onImportProject = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    try {
      if (file) {
        const rootNames = fs.listFolderContents().folders.map((f) => f.metadata.name);
        const base = file.name.replace(/\.zip$/i, "");
        const folderId = await fs.createFolder("/", uniqueName(base, rootNames));
        const bytes = new Uint8Array(await file.arrayBuffer());
        const res = await fs.transfer.importZip(folderId, bytes, acceptedFileType);
        toast.success(
          `Imported ${res.imported} file(s)` + (res.skipped ? ` (${res.skipped} skipped)` : ""),
        );
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      e.target.value = "";
    }
  };

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            <div className="w-full flex justify-between items-center">
              Projects
              <div className="flex items-center gap-1">
                <Dialog open={isOpen} onOpenChange={setIsOpen}>
                  <DialogTrigger>
                    <Tooltip delayDuration={1000}>
                      <TooltipTrigger>
                        <PlusIcon className="h-6 w-6 p-1 rounded-sm hover:bg-black/5 cursor-pointer" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Add new project</p>
                      </TooltipContent>
                    </Tooltip>
                  </DialogTrigger>
                  <NewProjectDialog close={() => setIsOpen(false)} />
                </Dialog>
                <Tooltip delayDuration={1000}>
                  <TooltipTrigger asChild>
                    <UploadIcon
                      onClick={() => importInputRef.current?.click()}
                      className="h-6 w-6 p-1 rounded-sm hover:bg-black/5 cursor-pointer"
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Import project (zip)</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <input
              ref={importInputRef}
              type="file"
              accept=".zip"
              hidden
              onChange={onImportProject}
            />
            <SidebarMenu>
              {projects.length === 0 ? (
                <SidebarMenuItem className="mx-auto">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        Create new project
                      </Button>
                    </DialogTrigger>
                    <NewProjectDialog close={() => setIsOpen(false)} />
                  </Dialog>
                </SidebarMenuItem>
              ) : (
                projects.map((project) => (
                  <FolderNode key={project.id} folder={project.metadata} />
                ))
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <hr />
        <WalletStatusCard />
        {/*<SidebarMenu>*/}
        {/*  {footerItems.map((item) => (*/}
        {/*    <SidebarMenuItem key={item.title}>*/}
        {/*      <SidebarMenuButton asChild>*/}
        {/*        <a href={item.url}>*/}
        {/*          <item.icon />*/}
        {/*          <span>{item.title}</span>*/}
        {/*        </a>*/}
        {/*      </SidebarMenuButton>*/}
        {/*    </SidebarMenuItem>*/}
        {/*  ))}*/}
        {/*</SidebarMenu>*/}
        <hr />
        <ThemeSwitch />
      </SidebarFooter>

    </Sidebar>
  );
}
