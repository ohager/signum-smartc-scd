import { useProjects } from "@/hooks/use-projects";
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

const footerItems = [
  {
    title: "Settings",
    url: "#",
    icon: SettingsIcon,
  },
];

export function LeftSidebar() {
  const { projects } = useProjects();

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            <div className="w-full flex justify-between items-center">
              Projects
              <Dialog>
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
                <NewProjectDialog />
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
                    <NewProjectDialog />
                  </Dialog>
                </SidebarMenuItem>
              ) : (
                projects.map((project) => (
                  <ProjectSidebarItem key={project.id} project={project} />
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
      </SidebarFooter>
    </Sidebar>
  );
}
