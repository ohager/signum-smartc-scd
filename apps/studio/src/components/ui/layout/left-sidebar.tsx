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

} from "../sidebar";

import {
  SettingsIcon,
  PlusIcon,
  UploadIcon,
  CrosshairIcon,
  HouseIcon,
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
import { findFolderChainToFile } from "@/features/project/tree-reveal";
import { revealFileRequestAtom } from "@/stores/project-tree-atoms";
import { useSetAtom } from "jotai";
import { Link, useMatch } from "react-router";
import { toast } from "sonner";
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

  const openedFileId = useMatch("/projects/:projectId/files/:fileId")?.params.fileId;
  const isHome = !!useMatch("/");
  const setRevealRequest = useSetAtom(revealFileRequestAtom);

  const onSelectOpenedFile = () => {
    if (!openedFileId) return;
    const chain = findFolderChainToFile(fs, openedFileId);
    if (!chain.length) return;
    setRevealRequest({ fileId: openedFileId, folderIds: new Set(chain) });
  };

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
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isHome}>
                  <Link to="/">
                    <HouseIcon className="h-4 w-4" />
                    <span>Home</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
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
                <Tooltip delayDuration={1000}>
                  <TooltipTrigger asChild>
                    <CrosshairIcon
                      aria-label="Select opened file"
                      onClick={onSelectOpenedFile}
                      className={
                        "h-6 w-6 p-1 rounded-sm " +
                        (openedFileId
                          ? "hover:bg-black/5 cursor-pointer"
                          : "opacity-40 cursor-default")
                      }
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Select opened file</p>
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
