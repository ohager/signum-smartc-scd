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

import { SettingsIcon, PlusIcon } from "lucide-react";
import { Button } from "../button";
import { Dialog, DialogTrigger } from "../dialog";
import { NewProjectDialog } from "@/features/project/new-project-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "../tooltip";
import { ProjectSidebarItem } from "@/features/project/project-sidebar-item";
import { useEffect, useState } from "react";
import { ThemeSwitch } from "@/components/theme-switch";
import { useFileSystem } from "@/hooks/use-file-system.ts";

const footerItems = [
  {
    title: "Settings",
    url: "#",
    icon: SettingsIcon,
  },
];

export function LeftSidebar() {
  const fs = useFileSystem();
  const [projects, setProjects] = useState([...fs.listFolderContents().folders]);

  useEffect(() => {
    function updateFolders() {
      setProjects([...fs.listFolderContents().folders]);
    }

    fs.addEventListener("file:*", updateFolders)
    fs.addEventListener("folder:*", updateFolders)
    return () => {
      fs.removeEventListener("folder:*", updateFolders)
      fs.removeEventListener("file:*", updateFolders)
    }
  }, []);

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
                  <ProjectSidebarItem key={project.id} project={project.metadata} />
                ))
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          {footerItems.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild>
                <a href={item.url}>
                  <item.icon />
                  <span>{item.title}</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
        <hr />
        <ThemeSwitch />
      </SidebarFooter>
    </Sidebar>
  );
}
