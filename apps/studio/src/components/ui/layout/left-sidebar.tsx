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
} from "lucide-react";
import { Button } from "../button";
import { Dialog, DialogTrigger } from "../dialog";
import { NewProjectDialog } from "@/features/project/new-project-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "../tooltip";
import { ProjectSidebarItem } from "@/features/project/project-sidebar-item";
import { useEffect, useState } from "react";
import { ThemeSwitch } from "@/components/theme-switch";
import { useFileSystem } from "@/hooks/use-file-system.ts";
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

const footerItems = [
  {
    title: "Settings",
    url: "#",
    icon: SettingsIcon,
  },
];

export function LeftSidebar() {
  const fs = useFileSystem();
  const [connectionError, setConnectionError] = useState("");
  const [showAlertDialog, setShowAlertDialog] = useState(false);
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


  const connectWallet = async (network: NetworkType) => {
    try{
      await wallet.connect(network);
    }catch (e){
      setShowAlertDialog(true);
      setConnectionError(e.message);
    }
  }


  const [isOpen, setIsOpen] = useState(false);
  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            <div className="w-full flex justify-between items-center">
              Projects
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
            </div>
          </SidebarGroupLabel>
          <SidebarGroupContent>
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
                  <ProjectSidebarItem
                    key={project.id}
                    project={project.metadata}
                  />
                ))
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <hr />
        <SidebarGroup>
          <SidebarGroupContent>
            <div className="w-full flex justify-between items-center">
              <SidebarGroupLabel>Wallet Connection</SidebarGroupLabel>
              <DropdownMenu>
                <DropdownMenuTrigger>
                  <SidebarMenuAction className="group-hover/menu-item:opacity-100 cursor-pointer">
                    <WalletIcon className="h-8 w-8 rounded-sm hover:bg-black/5 cursor-pointer" />
                  </SidebarMenuAction>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-full">
                  <DropdownMenuItem onClick={() => connectWallet("TestNet")}>
                    <FlaskConicalIcon className="h-4 w-4" />
                    Connect to Testnet
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => connectWallet("MainNet")}>
                    <CrownIcon className="h-4 w-4" />
                    Connect to Mainnet
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
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

      <AlertDialog
        open={showAlertDialog}
        onOpenChange={setShowAlertDialog}
        title="Connection Issue"
        type="warning"
        description={connectionError}
      />
    </Sidebar>
  );
}
